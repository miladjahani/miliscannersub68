/**
 * MiConfig Pro — Edge API Worker
 * 
 * این ورکر تمام عملکردهای قبلی Supabase Edge Functions را انجام می‌دهد:
 * - مدیریت توکن‌های Cloudflare
 * - استقرار ورکرها با انواع مختلف (edgetunnel, custom, misub_d1, misub_scanner)
 * - لاگ فعالیت‌ها
 * - اسکنر IP
 * 
 * دیتابیس: Cloudflare D1
 * کش: Cloudflare KV
 */

// ============================================
// Configuration
// ============================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const COMPAT_DATE = '2025-11-04';

// Worker source repositories
const SOURCE_REPO = 'miladjahani/miliconfig-pro';
const SOURCE_BRANCH = 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_BRANCH}`;

const WORKER_SOURCES = {
  edgetunnel: {
    url: 'https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js',
    label: 'cmliu/edgetunnel — ورکر کامل (VLESS/Trojan/SS + پنل)',
    compat: '2025-11-04',
    kvBinding: 'KV',
    configKey: 'config.json',
    configFormat: 'edgetunnel',
    uuidEnvName: 'UUID',
    bindingMode: 'kv',
  },
  edgetunnel_kv: {
    url: 'https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js',
    label: 'cmliu/edgetunnel (KV mode) — پیکربندی از KV',
    compat: '2025-11-04',
    kvBinding: 'KV',
    configKey: 'config.json',
    configFormat: 'edgetunnel',
    uuidEnvName: 'UUID',
    bindingMode: 'kv',
  },
  custom: {
    url: `${RAW_BASE}/public/repo/worker-source.js`,
    label: 'Mili — سورس پروکسی اختصاصی (CFnew v2.9.8c, cleaned)',
    compat: '2025-01-01',
    kvBinding: 'C',
    configKey: 'c',
    configFormat: 'custom',
    uuidEnvName: 'u',
    bindingMode: 'kv',
  },
  misub_d1: {
    url: `${RAW_BASE}/public/repo/misub-proxy-source.js`,
    label: 'MiSub — پنل چندکاربره پروکسی (D1)',
    compat: '2024-09-23',
    kvBinding: '',
    configKey: '',
    configFormat: 'misub_d1',
    uuidEnvName: '',
    bindingMode: 'd1',
  },
  misub_scanner: {
    url: `${RAW_BASE}/public/repo/misub-scanner-worker.js`,
    label: 'MiSub — موتور اسکنر/بهینه‌ساز (بدون binding)',
    compat: '2024-09-23',
    kvBinding: '',
    configKey: '',
    configFormat: 'misub_scanner',
    uuidEnvName: '',
    bindingMode: 'none',
  },
};

// ============================================
// Database Helpers (D1)
// ============================================

async function initDB(db) {
  const sql = `
    CREATE TABLE IF NOT EXISTS cf_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      last_used_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      worker_code TEXT,
      config TEXT,
      status TEXT DEFAULT 'pending',
      worker_url TEXT,
      panel_url TEXT,
      route TEXT,
      error_message TEXT,
      logs TEXT,
      uuid TEXT,
      custom_path TEXT,
      method TEXT,
      kv_namespace_id TEXT,
      cf_account_id TEXT,
      worker_source TEXT,
      deployment_config TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS bot_config (
      id TEXT PRIMARY KEY,
      bot_token TEXT,
      bot_username TEXT,
      webhook_url TEXT,
      is_active INTEGER DEFAULT 0,
      welcome_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS bot_users (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      is_active INTEGER DEFAULT 1,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_activity TEXT
    );
    
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_name TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `;
  
  await db.exec(sql);
}

function genUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ============================================
// API Handlers
// ============================================

async function handleGetTokens(db) {
  const { results } = await db.prepare('SELECT * FROM cf_tokens WHERE status = ? ORDER BY created_at DESC').bind('active').all();
  return Response.json({ success: true, data: results || [] });
}

async function handleCreateToken(db, body) {
  const { name, token } = body;
  const id = genUuid();
  
  await db.prepare(`
    INSERT INTO cf_tokens (id, name, token, status, created_at)
    VALUES (?, ?, ?, 'active', datetime('now'))
  `).bind(id, name, token).run();
  
  await logActivity(db, 'token_created', 'token', name);
  
  return Response.json({ success: true, data: { id, name } });
}

async function handleDeleteToken(db, id, name) {
  await db.prepare('DELETE FROM cf_tokens WHERE id = ?').bind(id).run();
  await logActivity(db, 'token_deleted', 'token', name);
  return Response.json({ success: true });
}

async function handleGetDeployments(db) {
  const { results } = await db.prepare('SELECT * FROM deployments ORDER BY created_at DESC').all();
  return Response.json({ success: true, data: results || [] });
}

async function handleGetDeployment(db, id) {
  const result = await db.prepare('SELECT * FROM deployments WHERE id = ?').bind(id).first();
  if (!result) {
    return Response.json({ success: false, error: 'Deployment not found' }, { status: 404 });
  }
  return Response.json({ success: true, data: result });
}

async function handleCreateDeployment(db, body) {
  const {
    name,
    worker_code,
    config,
    uuid,
    custom_path,
    method,
    worker_source,
    proxyip,
    admin_password,
  } = body;
  
  const id = genUuid();
  const configStr = JSON.stringify({
    method,
    custom_path,
    worker_source,
    proxyip,
    admin_password,
  });
  
  await db.prepare(`
    INSERT INTO deployments (
      id, name, worker_code, config, status, uuid, custom_path, method,
      worker_source, deployment_config, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, name, worker_code, configStr, uuid, custom_path || null, method,
    worker_source, configStr
  ).run();
  
  await logActivity(db, 'deployment_created', 'deployment', name);
  
  return Response.json({ success: true, data: { id } });
}

async function handleUpdateDeployment(db, id, updates) {
  const allowedFields = ['status', 'worker_url', 'panel_url', 'route', 'error_message', 'logs', 'kv_namespace_id', 'cf_account_id', 'worker_source', 'deployment_config'];
  const setClauses = [];
  const bindings = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      bindings.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
  }
  
  if (setClauses.length > 0) {
    setClauses.push(`updated_at = datetime('now')`);
    bindings.push(id);
    
    await db.prepare(`UPDATE deployments SET ${setClauses.join(', ')} WHERE id = ?`)
      .bind(...bindings).run();
  }
  
  return Response.json({ success: true });
}

async function logActivity(db, action, entityType, entityName, details = null) {
  const id = genUuid();
  await db.prepare(`
    INSERT INTO activity_logs (id, action, entity_type, entity_name, details, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).bind(id, action, entityType, entityName, details ? JSON.stringify(details) : null).run();
}

async function handleGetActivityLogs(db, limit = 100) {
  const { results } = await db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?').bind(limit).all();
  return Response.json({ success: true, data: results || [] });
}

// ============================================
// Cloudflare API Helpers
// ============================================

async function cloudflareJson(url, headers, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && data?.success !== false) {
    return { success: false, errors: [{ message: `HTTP ${response.status}` }] };
  }
  return data;
}

async function ensureKvNamespace(apiBase, accountId, headers, title, append) {
  const list = await cloudflareJson(
    `${apiBase}/accounts/${accountId}/storage/kv/namespaces?per_page=100`,
    headers,
  );
  
  if (list.success) {
    const existing = (list.result ?? []).find(item => item.title === title);
    if (existing?.id) {
      await append(`✓ KV namespace reused: ${existing.id.slice(0, 8)}...`);
      return existing.id;
    }
  }
  
  const created = await cloudflareJson(
    `${apiBase}/accounts/${accountId}/storage/kv/namespaces`,
    headers,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    },
  );
  
  if (!created.success || !created.result?.id) {
    const msg = created.errors?.[0]?.message ?? 'failed to create KV namespace';
    throw new Error(msg);
  }
  
  await append(`✓ KV namespace created: ${created.result.id.slice(0, 8)}...`);
  return created.result.id;
}

async function ensureD1Database(apiBase, accountId, headers, name, append) {
  const list = await cloudflareJson(
    `${apiBase}/accounts/${accountId}/d1/database?name=${encodeURIComponent(name)}`,
    headers,
  );
  
  const existing = (list.result ?? [])[0];
  if (existing?.uuid || existing?.id) {
    const id = existing.uuid ?? existing.id;
    await append(`✓ D1 database reused: ${name} (${String(id).slice(0, 8)}...)`);
    return id;
  }
  
  const created = await cloudflareJson(
    `${apiBase}/accounts/${accountId}/d1/database`,
    headers,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
  
  if (!created.success || !(created.result?.uuid ?? created.result?.id)) {
    const msg = created.errors?.[0]?.message ?? 'failed to create D1 database';
    throw new Error(msg);
  }
  
  const id = created.result.uuid ?? created.result.id;
  await append(`✓ D1 database created: ${name} (${String(id).slice(0, 8)}...)`);
  return id;
}

async function ensureD1Schema(apiBase, accountId, databaseId, headers, append) {
  const sql = `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `;
  
  const result = await cloudflareJson(
    `${apiBase}/accounts/${accountId}/d1/database/${databaseId}/query`,
    headers,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    },
  );
  
  if (!result.success) {
    const msg = result.errors?.[0]?.message ?? 'failed to initialize D1 schema';
    throw new Error(msg);
  }
  
  await append('✓ D1 schema initialized');
}

// ============================================
// Deployment Logic
// ============================================

async function doDeploy(env, body) {
  const {
    deployment_id,
    worker_name,
    cf_token,
    uuid,
    custom_path = '',
    custom_domain = '',
    zone_id = '',
    method = 'workers',
    worker_source = 'edgetunnel',
    proxyip = '',
    admin_password = '',
    cf_account_id = '',
    source_url = '',
  } = body;
  
  const apiBase = 'https://api.cloudflare.com/client/v4';
  const headers = { Authorization: `Bearer ${cf_token}` };
  const db = env.DB;
  
  async function appendLog(line) {
    const dep = await db.prepare('SELECT logs FROM deployments WHERE id = ?').bind(deployment_id).first();
    const existing = dep?.logs || '';
    await db.prepare('UPDATE deployments SET logs = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(existing + line + '\n', deployment_id).run();
  }
  
  try {
    await appendLog('verifying token...');
    const verifyResp = await fetch(`${apiBase}/user/tokens/verify`, { headers });
    const verifyData = await verifyResp.json();
    if (!verifyData.success) {
      await appendLog('✗ invalid cloudflare token');
      await db.prepare('UPDATE deployments SET status = ?, error_message = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind('failed', 'invalid cloudflare token', deployment_id).run();
      return;
    }
    await appendLog('✓ token verified');
    
    let accountId = cf_account_id.trim();
    let accountName = '';
    if (accountId) {
      await appendLog(`checking selected Cloudflare account ${accountId.slice(0, 8)}...`);
      const accountResp = await cloudflareJson(`${apiBase}/accounts/${accountId}`, headers);
      if (!accountResp.success || !accountResp.result?.id) {
        throw new Error(accountResp.errors?.[0]?.message ?? 'selected Cloudflare account is not accessible');
      }
      accountName = accountResp.result.name ?? accountId;
    } else {
      await appendLog('listing accounts...');
      const accountsData = await cloudflareJson(`${apiBase}/accounts?per_page=50`, headers);
      if (!accountsData.success || !accountsData.result?.length) {
        throw new Error('no Cloudflare accounts found');
      }
      accountId = accountsData.result[0].id;
      accountName = accountsData.result[0].name ?? accountId;
    }
    await appendLog(`✓ account: ${accountName} (${accountId.slice(0, 8)}...)`);
    
    const sourceConfig = WORKER_SOURCES[worker_source] ?? WORKER_SOURCES.edgetunnel;
    const compatDate = sourceConfig.compat;
    const kvBindingName = sourceConfig.kvBinding;
    const configKvKey = sourceConfig.configKey;
    const configFormat = sourceConfig.configFormat;
    const uuidEnv = sourceConfig.uuidEnvName;
    
    const resolvedSourceUrl = source_url.trim() || sourceConfig.url;
    await appendLog(`fetching worker source from ${sourceConfig.label}...`);
    await appendLog(`source: ${resolvedSourceUrl}`);
    const sourceResp = await fetch(resolvedSourceUrl);
    if (!sourceResp.ok) {
      await appendLog('✗ failed to fetch worker source');
      await db.prepare('UPDATE deployments SET status = ?, error_message = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind('failed', 'failed to fetch worker source', deployment_id).run();
      return;
    }
    const workerCode = await sourceResp.text();
    await appendLog(`✓ worker source fetched (${workerCode.length} bytes)`);
    
    const bindingMode = sourceConfig.bindingMode;
    let kvNamespaceId = '';
    let d1DatabaseId = '';
    
    // KV-backed sources
    if (bindingMode === 'kv') {
      await appendLog('preparing KV namespace...');
      kvNamespaceId = await ensureKvNamespace(
        apiBase,
        accountId,
        headers,
        `${worker_name}-kv`,
        (line) => appendLog(line),
      );
    }
    
    // D1-backed sources
    if (bindingMode === 'd1') {
      await appendLog('preparing D1 database...');
      const dbName = `${worker_name}-db`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 63);
      d1DatabaseId = await ensureD1Database(
        apiBase,
        accountId,
        headers,
        dbName,
        (line) => appendLog(line),
      );
      await ensureD1Schema(
        apiBase,
        accountId,
        d1DatabaseId,
        headers,
        (line) => appendLog(line),
      );
    }
    
    // Prepare initial config
    let initialConfig = {};
    let addTxtKey = 'ADD.txt';
    
    if (bindingMode === 'kv' && configFormat === 'custom') {
      initialConfig = {
        wk: '',
        ev: 'yes',
        et: 'no',
        ex: 'no',
        ech: 'no',
        tp: '',
        customDNS: 'https://223.5.5.5/dns-query',
        customECHDomain: 'cloudflare-ech.com',
        alpn: '',
        d: custom_path || '',
        p: proxyip || '',
        yx: '',
        yxURL: '',
        s: '',
        homepage: '',
        scu: 'https://url.v1.mk/sub',
        ena: 'no',
        epd: 'yes',
        epi: 'yes',
        egi: 'yes',
        ae: '',
        rm: '',
        qj: '',
        dkby: 'no',
        yxby: '',
        ipv4: 'yes',
        ipv6: 'yes',
        ispMobile: 'yes',
        ispUnicom: 'yes',
        ispTelecom: 'yes',
      };
      addTxtKey = 'ADD.txt';
    } else if (bindingMode === 'kv') {
      initialConfig = {
        UUID: uuid,
        HOST: '',
        HOSTS: [],
        PATH: custom_path ? (custom_path.startsWith('/') ? custom_path : '/' + custom_path) : '/',
        '协议类型': 'vless',
        '传输协议': 'ws',
        'gRPC 模式': 'gun',
        'gRPCUserAgent': 'Mozilla/5.0',
        '跳过证书验证': false,
        '启用 0RTT': false,
        'TLS 分片': null,
        '随机路径': false,
        'ECH': false,
        'ECHConfig': { DNS: 'https://dns.alidns.com/dns-query', SNI: 'cloudflare-ech.com' },
        'SS': { '加密方式': 'aes-128-gcm', 'TLS': true },
        'Fingerprint': 'chrome',
        '优选订阅生成': {
          local: true,
          '本地 IP 库': { '随机 IP': true, '随机数量': 16, '指定端口': -1 },
          SUB: null,
          SUBNAME: 'edgetunnel',
          SUBUpdateTime: 3,
          TOKEN: '',
        },
        '订阅转换配置': {
          SUBAPI: 'https://subapi.edt-pages.workers.dev',
          SUBCONFIG: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/main/Clash/config/ACL4SSR_Online_Mini_MultiMode.ini',
          SUBEMOJI: false,
          SUBLIST: false,
          UDP: false,
          XUDP: false,
          TLS13: false,
          APPEND_TYPE: false,
          SORT: false,
        },
        '反代': {
          proxyip: proxyip || 'auto',
          'SOCKS5': { '启用': null, '全局': false, '账号': '', '白名单': [] },
          '路径模板': {},
        },
        'TG': { '启用': false, 'BotToken': null, 'ChatID': null },
        'CF': { Email: null, 'GlobalAPIKey': null, 'AccountID': null, 'APIToken': null, 'UsageAPI': null, 'Usage': { success: false, pages: 0, workers: 0, total: 0, max: 100000 } },
      };
    }
    
    if (bindingMode === 'kv') {
      await fetch(`${apiBase}/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${configKvKey}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(initialConfig, null, 2),
      }).catch(() => null);
      await appendLog(`✓ initial config written to KV (${configKvKey})`);
      
      await fetch(`${apiBase}/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${addTxtKey}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'text/plain' },
        body: proxyip || '',
      }).catch(() => null);
    }
    
    let workerUrl = '';
    let panelUrl = '';
    const panelKey = custom_path || uuid;
    
    if (method === 'workers') {
      await appendLog('uploading worker script...');
      const meta = {
        main_module: 'worker.js',
        compatibility_date: compatDate,
        compatibility_flags: ['nodejs_compat'],
        bindings:
          bindingMode === 'kv'
            ? [
                { type: 'kv_namespace', name: kvBindingName, namespace_id: kvNamespaceId },
                { type: 'plain_text', name: uuidEnv, text: uuid },
                ...(configFormat === 'edgetunnel' ? [
                  { type: 'plain_text', name: 'PATH', text: custom_path ? (custom_path.startsWith('/') ? custom_path : '/' + custom_path) : '/' },
                  { type: 'plain_text', name: 'PROXYIP', text: proxyip },
                  ...(admin_password ? [{ type: 'plain_text', name: 'ADMIN', text: admin_password }] : []),
                ] : [
                  { type: 'plain_text', name: 'P', text: proxyip },
                ]),
              ]
            : bindingMode === 'd1'
            ? [
                { type: 'd1', name: 'DB', id: d1DatabaseId },
                { type: 'plain_text', name: 'CF_ACCOUNT_ID', text: accountId },
                { type: 'secret_text', name: 'CF_API_TOKEN', text: cf_token },
                { type: 'plain_text', name: 'WORKER_NAME', text: worker_name },
              ]
            : [],
      };
      
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      formData.append(
        'worker.js',
        new Blob([workerCode], { type: 'application/javascript+module' }),
        'worker.js',
      );
      
      const uploadResp = await fetch(
        `${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}`,
        { method: 'PUT', headers, body: formData },
      );
      const uploadData = await uploadResp.json();
      if (!uploadData.success) {
        const msg = uploadData.errors?.[0]?.message ?? 'failed to upload worker';
        await appendLog(`✗ ${msg}`);
        await db.prepare('UPDATE deployments SET status = ?, error_message = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .bind('failed', msg, deployment_id).run();
        return;
      }
      await appendLog('✓ worker script uploaded');
      
      await appendLog('enabling workers.dev route for script...');
      const subdomainResp = await fetch(`${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}/subdomain`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const subdomainResult = await subdomainResp.json().catch(() => ({}));
      if (subdomainResult.success) {
        await appendLog('✓ workers.dev route enabled');
      } else {
        await appendLog(`⚠ workers.dev route: ${subdomainResult.errors?.[0]?.message ?? 'unknown error'} — trying account subdomain...`);
        const existingSub = await fetch(`${apiBase}/accounts/${accountId}/workers/subdomain`, { headers });
        const existingSubData = await existingSub.json().catch(() => ({}));
        if (!existingSubData.result?.subdomain) {
          const subName = `edge-${worker_name}`.replace(/[^a-z0-9-]/g, '').slice(0, 30);
          await fetch(`${apiBase}/accounts/${accountId}/workers/subdomain`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subdomain: subName }),
          }).catch(() => {});
          await appendLog(`✓ account subdomain set: ${subName}`);
        }
        await fetch(`${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}/subdomain`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        }).catch(() => {});
      }
      
      await fetch(`${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}/settings`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workers_dev: true, preview_version_id: null }),
      }).catch(() => {});
      await appendLog('✓ workers.dev route enabled');
      
      await appendLog('reading workers.dev subdomain...');
      const subResp = await fetch(`${apiBase}/accounts/${accountId}/workers/subdomain`, { headers });
      const subData = await subResp.json();
      const subdomain = subData.result?.subdomain;
      workerUrl = subdomain
        ? `https://${worker_name}.${subdomain}.workers.dev`
        : `https://${worker_name}.workers.dev`;
      
      panelUrl = `${workerUrl}/${panelKey}`;
    } else {
      // Pages deployment
      await appendLog('preparing pages deployment...');
      const pagesFd = new FormData();
      const manifest = {
        pages: [
          {
            routes: [{ pattern: '*', zone_id, custom_domain }],
            functions: [{ entrypoint: 'default', path: '_worker.js' }],
          },
        ],
      };
      pagesFd.append('metadata', new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
      pagesFd.append('_worker.js', new Blob([workerCode], { type: 'application/javascript+module' }));
      
      const pagesResp = await cloudflareJson(
        `${apiBase}/accounts/${accountId}/pages/projects/${worker_name}/deployments`,
        { method: 'POST', headers, body: pagesFd },
      );
      
      if (!pagesResp.success) {
        const msg = pagesResp.errors?.[0]?.message ?? 'failed to deploy pages';
        await appendLog(`✗ ${msg}`);
        await db.prepare('UPDATE deployments SET status = ?, error_message = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .bind('failed', msg, deployment_id).run();
        return;
      }
      
      await appendLog('✓ pages deployment submitted');
      
      if (custom_domain && zone_id) {
        await appendLog(`attaching custom domain ${custom_domain}...`);
        await cloudflareJson(
          `${apiBase}/zones/${zone_id}/custom_hostnames`,
          headers,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostname: custom_domain }),
          },
        ).catch(() => {});
        await appendLog(`✓ custom domain attached: ${custom_domain}`);
        workerUrl = `https://${custom_domain}`;
        panelUrl = `${workerUrl}/${panelKey}`;
      } else {
        const projectName = worker_name.replace(/[^a-z0-9-]/g, '-').slice(0, 63);
        workerUrl = `https://${projectName}.pages.dev`;
        panelUrl = `${workerUrl}/${panelKey}`;
      }
    }
    
    await appendLog(`✓ worker URL: ${workerUrl}`);
    await appendLog(`✓ panel URL: ${panelUrl}`);
    await appendLog('✓ deployment complete!');
    
    await db.prepare(`
      UPDATE deployments SET
        status = 'deployed',
        worker_url = ?,
        panel_url = ?,
        kv_namespace_id = ?,
        cf_account_id = ?,
        route = ?,
        worker_source = ?,
        deployment_config = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      workerUrl,
      panelUrl,
      kvNamespaceId || null,
      accountId,
      custom_domain || null,
      worker_source,
      JSON.stringify({
        source: resolvedSourceUrl,
        binding_mode: bindingMode,
        config_format: configFormat,
        kv_namespace_id: kvNamespaceId || null,
        d1_database_id: d1DatabaseId || null,
        method,
      }),
      deployment_id,
    ).run();
    
    await logActivity(db, 'deployment_deployed', 'deployment', worker_name);
    
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    await appendLog(`✗ ${msg}`);
    await db.prepare('UPDATE deployments SET status = ?, error_message = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind('failed', msg, deployment_id).run();
  }
}

// ============================================
// Request Router
// ============================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: CORS_HEADERS });
    }
    
    // Initialize DB
    await initDB(env.DB);
    
    // API Routes
    if (path.startsWith('/api/')) {
      try {
        let body = {};
        if (['POST', 'PUT'].includes(request.method)) {
          body = await request.json().catch(() => ({}));
        }
        
        // Tokens
        if (path === '/api/tokens' && request.method === 'GET') {
          return handleGetTokens(env.DB);
        }
        if (path === '/api/tokens' && request.method === 'POST') {
          return handleCreateToken(env.DB, body);
        }
        if (path.match(/^\/api\/tokens\/[a-f0-9-]+$/) && request.method === 'DELETE') {
          const id = path.split('/').pop();
          const token = await env.DB.prepare('SELECT name FROM cf_tokens WHERE id = ?').bind(id).first();
          return handleDeleteToken(env.DB, id, token?.name || 'unknown');
        }
        
        // Deployments
        if (path === '/api/deployments' && request.method === 'GET') {
          return handleGetDeployments(env.DB);
        }
        if (path === '/api/deployments' && request.method === 'POST') {
          return handleCreateDeployment(env.DB, body);
        }
        if (path.match(/^\/api\/deployments\/[a-f0-9-]+$/) && request.method === 'GET') {
          const id = path.split('/').pop();
          return handleGetDeployment(env.DB, id);
        }
        if (path.match(/^\/api\/deployments\/[a-f0-9-]+$/) && request.method === 'PUT') {
          const id = path.split('/').pop();
          return handleUpdateDeployment(env.DB, id, body);
        }
        
        // Activity Logs
        if (path === '/api/activity-logs' && request.method === 'GET') {
          const limit = parseInt(url.searchParams.get('limit') || '100');
          return handleGetActivityLogs(env.DB, limit);
        }
        
        // Deploy trigger (background)
        if (path === '/api/deploy' && request.method === 'POST') {
          const { deployment_id } = body;
          ctx.waitUntil(doDeploy(env, body));
          return Response.json({
            success: true,
            message: 'deployment started',
            deployment_id,
          });
        }
        
        return Response.json({ success: false, error: 'Not found' }, { status: 404 });
        
      } catch (err) {
        return Response.json({
          success: false,
          error: err instanceof Error ? err.message : 'unknown error',
        }, { status: 500 });
      }
    }
    
    // Health check
    if (path === '/health') {
      return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
    }
    
    return Response.json({
      message: 'MiConfig Pro Edge API',
      endpoints: [
        'GET /api/tokens',
        'POST /api/tokens',
        'DELETE /api/tokens/:id',
        'GET /api/deployments',
        'POST /api/deployments',
        'GET /api/deployments/:id',
        'PUT /api/deployments/:id',
        'GET /api/activity-logs',
        'POST /api/deploy',
        'GET /health',
      ],
    });
  },
};

// Helper for JSON responses
Response.json = (data, init = {}) => {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  });
};
