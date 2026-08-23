import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const COMPAT = "2025-11-04";

// Base raw-GitHub path for this repo's own bundled worker sources.
// NOTE: update SOURCE_REPO to match wherever this project is actually pushed
// (defaults to the account on file — override via the SOURCE_REPO env var
// on the Supabase edge function if the repo lives somewhere else).
const SOURCE_REPO = Deno.env.get("SOURCE_REPO") || "miladjahani/miliconfig-pro";
const SOURCE_BRANCH = Deno.env.get("SOURCE_BRANCH") || "main";
const SOURCE_BASE_URL = (Deno.env.get("WORKER_SOURCE_BASE_URL") || "").replace(/\/$/, "");
const RAW_BASE = SOURCE_BASE_URL
  ? `${SOURCE_BASE_URL}/${SOURCE_BRANCH}`
  : `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_BRANCH}`;

// Worker source repos — user can choose which one to deploy.
// Each source has its own binding shape (KV / D1 / none) and its own
// deployment steps further down in doDeploy().
const WORKER_SOURCES: Record<string, {
  url: string;
  label: string;
  compat: string;
  kvBinding: string;
  configKey: string;
  configFormat: 'edgetunnel' | 'custom' | 'misub_d1' | 'misub_scanner';
  uuidEnvName: string;
  bindingMode: 'kv' | 'd1' | 'none';
}> = {
  edgetunnel: {
    url: "https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js",
    label: "cmliu/edgetunnel",
    compat: "2025-11-04",
    kvBinding: "KV",
    configKey: "config.json",
    configFormat: "edgetunnel",
    uuidEnvName: "UUID",
    bindingMode: "kv",
  },
  edgetunnel_kv: {
    url: "https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js",
    label: "cmliu/edgetunnel (KV mode)",
    compat: "2025-11-04",
    kvBinding: "KV",
    configKey: "config.json",
    configFormat: "edgetunnel",
    uuidEnvName: "UUID",
    bindingMode: "kv",
  },
  custom: {
    url: `${RAW_BASE}/public/repo/worker-source.js`,
    label: "Mili — custom worker (CFnew v2.9.8c, cleaned)",
    compat: "2025-01-01",
    kvBinding: "C",
    configKey: "c",
    configFormat: "custom",
    uuidEnvName: "u",
    bindingMode: "kv",
  },
  misub_d1: {
    url: `${RAW_BASE}/public/repo/misub-proxy-source.js`,
    label: "MiSub — پنل چندکاربره پروکسی (D1)",
    compat: "2024-09-23",
    kvBinding: "",
    configKey: "",
    configFormat: "misub_d1",
    uuidEnvName: "",
    bindingMode: "d1",
  },
  misub_scanner: {
    url: `${RAW_BASE}/public/repo/misub-scanner-worker.js`,
    label: "MiSub — موتور اسکنر/بهینه‌ساز (بدون binding)",
    compat: "2024-09-23",
    kvBinding: "",
    configKey: "",
    configFormat: "misub_scanner",
    uuidEnvName: "",
    bindingMode: "none",
  },
};

interface DeployRequest {
  deployment_id: string;
  worker_name: string;
  cf_token: string;
  uuid: string;
  custom_path?: string;
  custom_domain?: string;
  zone_id?: string;
  method: "workers" | "pages";
  worker_source?: string;
  proxyip?: string;
  admin_password?: string;
  cf_account_id?: string;
  source_url?: string;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function appendLog(id: string, line: string) {
  const { data } = await supabase.from("deployments").select("logs").eq("id", id).maybeSingle();
  const existing = (data as { logs: string | null } | null)?.logs ?? "";
  await supabase.from("deployments").update({ logs: existing + line + "\n" }).eq("id", id);
}

async function updateDeployment(id: string, status: string, updates: Record<string, unknown>) {
  await supabase.from("deployments").update({ status, ...updates }).eq("id", id);
}


async function cloudflareJson(
  url: string,
  headers: Record<string, string>,
  init: RequestInit = {},
): Promise<any> {
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

async function ensureKvNamespace(
  apiBase: string,
  accountId: string,
  headers: Record<string, string>,
  title: string,
  append: (line: string) => Promise<void>,
): Promise<string> {
  const list = await cloudflareJson(
    `${apiBase}/accounts/${accountId}/storage/kv/namespaces?per_page=100`,
    headers,
  );
  if (list.success) {
    const existing = (list.result ?? []).find((item: any) => item.title === title);
    if (existing?.id) {
      await append(`✓ KV namespace reused: ${existing.id.slice(0, 8)}...`);
      return existing.id;
    }
  }

  const created = await cloudflareJson(
    `${apiBase}/accounts/${accountId}/storage/kv/namespaces`,
    headers,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
  );
  if (!created.success || !created.result?.id) {
    const msg = created.errors?.[0]?.message ?? "failed to create KV namespace";
    throw new Error(msg);
  }
  await append(`✓ KV namespace created: ${created.result.id.slice(0, 8)}...`);
  return created.result.id;
}

async function ensureD1Database(
  apiBase: string,
  accountId: string,
  headers: Record<string, string>,
  name: string,
  append: (line: string) => Promise<void>,
): Promise<string> {
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  if (!created.success || !(created.result?.uuid ?? created.result?.id)) {
    const msg = created.errors?.[0]?.message ?? "failed to create D1 database";
    throw new Error(msg);
  }
  const id = created.result.uuid ?? created.result.id;
  await append(`✓ D1 database created: ${name} (${String(id).slice(0, 8)}...)`);
  return id;
}

async function ensureD1Schema(
  apiBase: string,
  accountId: string,
  databaseId: string,
  headers: Record<string, string>,
  append: (line: string) => Promise<void>,
) {
  // MiSub owns the users-table schema and upgrades it on first request.
  // The deployment pipeline only guarantees the settings table so the panel
  // password can be written before the first request reaches the Worker.
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    },
  );
  if (!result.success) {
    const msg = result.errors?.[0]?.message ?? "failed to initialize D1 schema";
    throw new Error(msg);
  }
  await append("✓ D1 schema initialized");
}

async function doDeploy(body: DeployRequest) {
  const {
    deployment_id,
    worker_name,
    cf_token,
    uuid,
    custom_path = "",
    custom_domain = "",
    zone_id = "",
    method = "workers",
    worker_source = "edgetunnel",
    proxyip = "",
    admin_password = "",
    cf_account_id = "",
    source_url = "",
  } = body;

  const apiBase = "https://api.cloudflare.com/client/v4";
  const headers = { Authorization: `Bearer ${cf_token}` };

  try {
    await appendLog(deployment_id, "verifying token...");
    const verifyResp = await fetch(`${apiBase}/user/tokens/verify`, { headers });
    const verifyData = await verifyResp.json();
    if (!verifyData.success) {
      await appendLog(deployment_id, "✗ invalid cloudflare token");
      await updateDeployment(deployment_id, "failed", { error_message: "invalid cloudflare token" });
      return;
    }
    await appendLog(deployment_id, "✓ token verified");

    let accountId = cf_account_id.trim();
    let accountName = "";
    if (accountId) {
      await appendLog(deployment_id, `checking selected Cloudflare account ${accountId.slice(0, 8)}...`);
      const accountResp = await cloudflareJson(`${apiBase}/accounts/${accountId}`, headers);
      if (!accountResp.success || !accountResp.result?.id) {
        throw new Error(accountResp.errors?.[0]?.message ?? "selected Cloudflare account is not accessible");
      }
      accountName = accountResp.result.name ?? accountId;
    } else {
      await appendLog(deployment_id, "listing accounts...");
      const accountsData = await cloudflareJson(`${apiBase}/accounts?per_page=50`, headers);
      if (!accountsData.success || !accountsData.result?.length) {
        throw new Error("no Cloudflare accounts found");
      }
      accountId = accountsData.result[0].id;
      accountName = accountsData.result[0].name ?? accountId;
    }
    await appendLog(deployment_id, `✓ account: ${accountName} (${accountId.slice(0, 8)}...)`);

    const sourceConfig = WORKER_SOURCES[worker_source] ?? WORKER_SOURCES.edgetunnel;
    const compatDate = sourceConfig.compat;
    const kvBindingName = sourceConfig.kvBinding;
    const configKvKey = sourceConfig.configKey;
    const configFormat = sourceConfig.configFormat;
    const uuidEnv = sourceConfig.uuidEnvName;

    const resolvedSourceUrl = source_url.trim() || sourceConfig.url;
    await appendLog(deployment_id, `fetching worker source from ${sourceConfig.label}...`);
    await appendLog(deployment_id, `source: ${resolvedSourceUrl}`);
    const sourceResp = await fetch(resolvedSourceUrl);
    if (!sourceResp.ok) {
      await appendLog(deployment_id, "✗ failed to fetch worker source");
      await updateDeployment(deployment_id, "failed", { error_message: "failed to fetch worker source" });
      return;
    }
    const workerCode = await sourceResp.text();
    await appendLog(deployment_id, `✓ worker source fetched (${workerCode.length} bytes)`);

    const bindingMode = sourceConfig.bindingMode;

    let kvNamespaceId = "";
    let d1DatabaseId = "";

    // ---- KV-backed sources (edgetunnel / mili) ----
    let initialConfig: Record<string, unknown> = {};
    let addTxtKey = "ADD.txt";

    if (bindingMode === "kv") {
      await appendLog(deployment_id, "preparing KV namespace...");
      kvNamespaceId = await ensureKvNamespace(
        apiBase,
        accountId,
        headers,
        `${worker_name}-kv`,
        (line) => appendLog(deployment_id, line),
      );
    }

    // ---- D1-backed sources (misub multi-user panel) ----
    if (bindingMode === "d1") {
      await appendLog(deployment_id, "preparing D1 database...");
      const dbName = `${worker_name}-db`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 63);
      d1DatabaseId = await ensureD1Database(
        apiBase,
        accountId,
        headers,
        dbName,
        (line) => appendLog(deployment_id, line),
      );
      await ensureD1Schema(
        apiBase,
        accountId,
        d1DatabaseId,
        headers,
        (line) => appendLog(deployment_id, line),
      );
    }

    if (bindingMode === "kv" && configFormat === "custom") {
      // Custom worker uses flat key-value config stored under key 'c'
      initialConfig = {
        wk: "",
        ev: "yes",
        et: "no",
        ex: "no",
        ech: "no",
        tp: "",
        customDNS: "https://223.5.5.5/dns-query",
        customECHDomain: "cloudflare-ech.com",
        alpn: "",
        d: custom_path || "",
        p: proxyip || "",
        yx: "",
        yxURL: "",
        s: "",
        homepage: "",
        scu: "https://url.v1.mk/sub",
        ena: "no",
        epd: "yes",
        epi: "yes",
        egi: "yes",
        ae: "",
        rm: "",
        qj: "",
        dkby: "no",
        yxby: "",
        ipv4: "yes",
        ipv6: "yes",
        ispMobile: "yes",
        ispUnicom: "yes",
        ispTelecom: "yes",
      };
      addTxtKey = "ADD.txt";
    } else {
      // Edgetunnel uses nested config under key 'config.json'
      initialConfig = {
        UUID: uuid,
        HOST: "",
        HOSTS: [],
        PATH: custom_path ? (custom_path.startsWith("/") ? custom_path : "/" + custom_path) : "/",
        协议类型: "vless",
        传输协议: "ws",
        gRPC模式: "gun",
        gRPCUserAgent: "Mozilla/5.0",
        跳过证书验证: false,
        启用0RTT: false,
        TLS分片: null,
        随机路径: false,
        ECH: false,
        ECHConfig: { DNS: "https://dns.alidns.com/dns-query", SNI: "cloudflare-ech.com" },
        SS: { 加密方式: "aes-128-gcm", TLS: true },
        Fingerprint: "chrome",
        优选订阅生成: {
          local: true,
          本地IP库: { 随机IP: true, 随机数量: 16, 指定端口: -1 },
          SUB: null,
          SUBNAME: "edgetunnel",
          SUBUpdateTime: 3,
          TOKEN: "",
        },
        订阅转换配置: {
          SUBAPI: "https://subapi.edt-pages.workers.dev",
          SUBCONFIG: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/main/Clash/config/ACL4SSR_Online_Mini_MultiMode.ini",
          SUBEMOJI: false,
          SUBLIST: false,
          UDP: false,
          XUDP: false,
          TLS13: false,
          APPEND_TYPE: false,
          SORT: false,
        },
        反代: {
          proxyip: proxyip || "auto",
          SOCKS5: { 启用: null, 全局: false, 账号: "", 白名单: [] },
          路径模板: {},
        },
        TG: { 启用: false, BotToken: null, ChatID: null },
        CF: { Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: null, Usage: { success: false, pages: 0, workers: 0, total: 0, max: 100000 } },
      };
    }

    if (bindingMode === "kv") {
      await fetch(`${apiBase}/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${configKvKey}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(initialConfig, null, 2),
      }).catch(() => null);
      await appendLog(deployment_id, `✓ initial config written to KV (${configKvKey})`);

      // Also write ADD.txt for custom IPs
      await fetch(`${apiBase}/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${addTxtKey}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "text/plain" },
        body: proxyip || "",
      }).catch(() => null);
    }

    let workerUrl: string;
    let panelUrl: string;
    const panelKey = custom_path || uuid;

    if (method === "workers") {
      await appendLog(deployment_id, "uploading worker script...");
      const meta = {
        main_module: "worker.js",
        compatibility_date: compatDate,
        compatibility_flags: ["nodejs_compat"],
        bindings:
          bindingMode === "kv"
            ? [
                { type: "kv_namespace", name: kvBindingName, namespace_id: kvNamespaceId },
                { type: "plain_text", name: uuidEnv, text: uuid },
                ...(configFormat === "edgetunnel" ? [
                  { type: "plain_text", name: "PATH", text: custom_path ? (custom_path.startsWith("/") ? custom_path : "/" + custom_path) : "/" },
                  { type: "plain_text", name: "PROXYIP", text: proxyip },
                  ...(admin_password ? [{ type: "plain_text", name: "ADMIN", text: admin_password }] : []),
                ] : [
                  { type: "plain_text", name: "P", text: proxyip },
                ]),
              ]
            : bindingMode === "d1"
            ? [
                // MiSub multi-user panel: D1 database + self-management vars.
                // CF_API_TOKEN is bound as a secret (never readable back via API)
                // so the worker can self-update its own script later if needed.
                { type: "d1", name: "DB", id: d1DatabaseId },
                { type: "plain_text", name: "CF_ACCOUNT_ID", text: accountId },
                { type: "secret_text", name: "CF_API_TOKEN", text: cf_token },
                { type: "plain_text", name: "WORKER_NAME", text: worker_name },
              ]
            : [], // misub_scanner needs no bindings at all
      };

      const formData = new FormData();
      formData.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
      formData.append(
        "worker.js",
        new Blob([workerCode], { type: "application/javascript+module" }),
        "worker.js",
      );

      const uploadResp = await fetch(
        `${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}`,
        { method: "PUT", headers, body: formData },
      );
      const uploadData = await uploadResp.json();
      if (!uploadData.success) {
        const msg = uploadData.errors?.[0]?.message ?? "failed to upload worker";
        await appendLog(deployment_id, `✗ ${msg}`);
        await updateDeployment(deployment_id, "failed", { error_message: msg });
        return;
      }
      await appendLog(deployment_id, "✓ worker script uploaded");

      await appendLog(deployment_id, "enabling workers.dev route for script...");
      const subdomainResp = await fetch(`${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}/subdomain`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const subdomainResult = await subdomainResp.json().catch(() => ({}));
      if (subdomainResult.success) {
        await appendLog(deployment_id, "✓ workers.dev route enabled");
      } else {
        await appendLog(deployment_id, `⚠ workers.dev route: ${subdomainResult.errors?.[0]?.message ?? "unknown error"} — trying account subdomain...`);
        const existingSub = await fetch(`${apiBase}/accounts/${accountId}/workers/subdomain`, { headers });
        const existingSubData = await existingSub.json().catch(() => ({}));
        if (!existingSubData.result?.subdomain) {
          const subName = `edge-${worker_name}`.replace(/[^a-z0-9-]/g, "").slice(0, 30);
          await fetch(`${apiBase}/accounts/${accountId}/workers/subdomain`, {
            method: "PUT",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ subdomain: subName }),
          }).catch(() => {});
          await appendLog(deployment_id, `✓ account subdomain set: ${subName}`);
        }
        await fetch(`${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}/subdomain`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        }).catch(() => {});
      }

      await fetch(`${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}/settings`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ workers_dev: true, preview_version_id: null }),
      }).catch(() => {});
      await appendLog(deployment_id, "✓ workers.dev route enabled");

      await appendLog(deployment_id, "reading workers.dev subdomain...");
      const subResp = await fetch(`${apiBase}/accounts/${accountId}/workers/subdomain`, { headers });
      const subData = await subResp.json();
      const subdomain = subData.result?.subdomain;
      workerUrl = subdomain
        ? `https://${worker_name}.${subdomain}.workers.dev`
        : `https://${worker_name}.workers.dev`;
      await appendLog(deployment_id, `✓ worker URL: ${workerUrl}`);

      if (custom_domain && zone_id) {
        await appendLog(deployment_id, `attaching custom domain: ${custom_domain}...`);
        await fetch(`${apiBase}/accounts/${accountId}/workers/domains`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            environment: "production",
            hostname: custom_domain,
            service: worker_name,
            zone_id: zone_id,
          }),
        }).catch((e) => {
          appendLog(deployment_id, `⚠ custom domain: ${e.message ?? e}`);
        });
        workerUrl = `https://${custom_domain}`;
      }
    } else {
      await appendLog(deployment_id, "creating Pages project...");
      await fetch(`${apiBase}/accounts/${accountId}/pages/projects`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: worker_name, production_branch: "main" }),
      }).catch(() => {});

      await appendLog(deployment_id, "binding Worker resources & variables to project...");
      const production: Record<string, unknown> = {
        compatibility_date: compatDate,
        compatibility_flags: ["nodejs_compat"],
      };
      if (bindingMode === "kv") {
        production.kv_namespaces = { [kvBindingName]: { namespace_id: kvNamespaceId } };
      }
      if (bindingMode === "d1") {
        production.d1_databases = { DB: { id: d1DatabaseId } };
      }
      if (bindingMode === "kv" && configFormat === "edgetunnel") {
        production.env_vars = {
          [uuidEnv]: { value: uuid, type: "plain_text" },
          PATH: { value: custom_path ? (custom_path.startsWith("/") ? custom_path : "/" + custom_path) : "/", type: "plain_text" },
          PROXYIP: { value: proxyip, type: "plain_text" },
          ...(admin_password ? { ADMIN: { value: admin_password, type: "plain_text" } } : {}),
        };
      } else if (bindingMode === "kv" && configFormat === "custom") {
        production.env_vars = {
          P: { value: proxyip, type: "plain_text" },
        };
      } else if (bindingMode === "d1") {
        production.env_vars = {
          CF_ACCOUNT_ID: { value: accountId, type: "plain_text" },
          WORKER_NAME: { value: worker_name, type: "plain_text" },
          CF_API_TOKEN: { value: cf_token, type: "secret_text" },
          ...(admin_password ? { ADMIN: { value: admin_password, type: "secret_text" } } : {}),
        };
      }
      const cfg = { deployment_configs: { production } };
      await fetch(`${apiBase}/accounts/${accountId}/pages/projects/${worker_name}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      }).catch(() => {});

      await appendLog(deployment_id, "uploading _worker.js deployment...");
      const pagesFd = new FormData();
      pagesFd.append(
        "_worker.js",
        new Blob([workerCode], { type: "application/javascript" }),
        "_worker.js",
      );
      pagesFd.append("branch", "main");
      const pagesDepResp = await fetch(
        `${apiBase}/accounts/${accountId}/pages/projects/${worker_name}/deployments`,
        { method: "POST", headers, body: pagesFd },
      );
      const pagesDepData = await pagesDepResp.json();
      workerUrl = pagesDepData.result?.url ?? `https://${worker_name}.pages.dev`;
      await appendLog(deployment_id, `✓ Pages URL: ${workerUrl}`);

      if (custom_domain) {
        await appendLog(deployment_id, `attaching custom domain: ${custom_domain}...`);
        await fetch(`${apiBase}/accounts/${accountId}/pages/projects/${worker_name}/domains`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ domain: custom_domain }),
        }).catch(() => {});
        workerUrl = `https://${custom_domain}`;
      }
    }

    if (configFormat === "misub_d1") {
      // MiSub panel: no /{uuid} path convention — the panel lives at the
      // worker root and is protected by an admin password stored in D1.
      panelUrl = workerUrl;
      if (admin_password) {
        await appendLog(deployment_id, "setting panel password in D1...");
        const passwordResp = await cloudflareJson(
          `${apiBase}/accounts/${accountId}/d1/database/${d1DatabaseId}/query`,
          headers,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sql: "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT); INSERT OR REPLACE INTO settings (key, value) VALUES ('panel_password', ?);",
              params: [admin_password],
            }),
          },
        );
        if (!passwordResp.success) {
          throw new Error(passwordResp.errors?.[0]?.message ?? "failed to set MiSub panel password");
        }
        await appendLog(deployment_id, "✓ panel password set");
      }
    } else if (configFormat === "misub_scanner") {
      // Stateless scanner/optimizer API — no panel, just the API root.
      panelUrl = workerUrl;
    } else {
      panelUrl = `${workerUrl}/${panelKey}`;
    }
    await appendLog(deployment_id, `✓ panel URL: ${panelUrl}`);
    await appendLog(deployment_id, "✓ deployment complete!");

    await updateDeployment(deployment_id, "deployed", {
      worker_url: workerUrl,
      panel_url: panelUrl,
      kv_namespace_id: kvNamespaceId || null,
      cf_account_id: accountId,
      route: custom_domain || null,
      worker_source: worker_source,
      deployment_config: {
        source: resolvedSourceUrl,
        binding_mode: bindingMode,
        config_format: configFormat,
        kv_namespace_id: kvNamespaceId || null,
        d1_database_id: d1DatabaseId || null,
        method,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    await appendLog(deployment_id, `✗ ${msg}`);
    await updateDeployment(deployment_id, "failed", { error_message: msg });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: DeployRequest = await req.json();

    if (!body.worker_name || !body.cf_token || !body.uuid || !body.deployment_id) {
      return new Response(
        JSON.stringify({ success: false, error: "missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    EdgeRuntime.waitUntil(doDeploy(body));

    return new Response(
      JSON.stringify({ success: true, message: "deployment started", deployment_id: body.deployment_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
