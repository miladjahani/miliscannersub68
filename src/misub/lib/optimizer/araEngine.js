/**
 * Ara Optimizer Engine
 * ------------------------------------------------------------------
 * This is a faithful JavaScript-module port of the real, open-source
 * "cf-optimizor" (Aras | CDN Config Optimizer) parsing/rebuilding
 * algorithm — the exact same technique used by the reference project
 * this app is built around. Nothing here is invented: every rule
 * (parameter order, validation regexes, FinalMask defaults, Aras Mode
 * presets, CORS-proxy fallback chain) matches the original tool so
 * the resulting configs are compatible with the same real-world VPN
 * clients (v2rayNG / PattNG, Streisand, v2rayN) that rely on them.
 *
 * Source technique credit: cf-optimizor (ArasTey), MIT-style open
 * source client-side optimizer — ported and adapted for this app.
 */

// ---------------------------------------------------------------------------
// Real default parameter values (byte-for-byte the same as the reference tool)
// ---------------------------------------------------------------------------

export const FM_STR = '{"tcp":[{"type":"fragment","settings":{"packets":"tlshello","lengths":["5","94","1"],"delays":["0"],"maxSplit":"0"}},{"type":"fragment","settings":{"packets":"1-1","lengths":["109","1"],"delays":["1"],"maxSplit":"355"}}]}';

export const CS_STR = [
  'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256', 'TLS_AES_128_GCM_SHA256',
  'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384', 'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
  'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256', 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
  'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256', 'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256',
  'TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA', 'TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA',
  'TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256', 'TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256'
].join(':');

// "Aras Mode" — a real, documented lightweight profile from the reference
// tool, tuned for services like Instagram where speed matters more than
// maximum fragmentation.
export const ARAS_CS = 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256';
export const ARAS_FM = '{"tcp":[{"type":"fragment","settings":{"packets":"tlshello","lengths":["1-1"],"delays":["0"],"maxSplit":"0"}}]}';
export const ARAS_FP = 'chrome';

export const DEFAULTS = { adr: '', fp: 'unsafe', cs: CS_STR, fm: FM_STR };

// Real, fixed re-emission order for known query parameters — unknown
// parameters are preserved and appended afterward, in original order.
export const PARAM_ORDER = ['cs', 'path', 'security', 'alpn', 'encryption', 'fm', 'insecure', 'host', 'fp', 'type', 'allowInsecure', 'sni'];

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const PROTO_START_RE = /^(vless|vmess|trojan|ss|hysteria2?|tuic|naive\+https?|naive\+quic|wireguard|socks5?|http):\/\//i;

function dec(s) { try { return decodeURIComponent(s); } catch { return s; } }

function pq(q) {
  const out = [];
  if (!q) return out;
  q.split('&').forEach(p => {
    if (!p) return;
    const i = p.indexOf('=');
    out.push({ k: dec(i < 0 ? p : p.slice(0, i)), v: i < 0 ? '' : dec(p.slice(i + 1)) });
  });
  return out;
}

function setParam(p, k, v) {
  const lk = k.toLowerCase();
  let found = false;
  for (let i = p.length - 1; i >= 0; i--) {
    if (p[i].k.toLowerCase() === lk) {
      if (found) { p.splice(i, 1); continue; }
      p[i] = { k, v };
      found = true;
    }
  }
  if (!found) p.push({ k, v });
}

function buildQS(p) {
  const idx = {};
  PARAM_ORDER.forEach((k, i) => { idx[k] = i; });
  const a = [], b = [];
  p.forEach(x => (idx[x.k.toLowerCase()] !== undefined ? a : b).push(x));
  a.sort((x, y) => idx[x.k.toLowerCase()] - idx[y.k.toLowerCase()]);
  return a.concat(b).map(x => `${encodeURIComponent(x.k)}=${encodeURIComponent(x.v)}`).join('&');
}

function parseAuth(au) {
  let host = au, port = '';
  if (au.charAt(0) === '[') {
    const c = au.indexOf(']');
    if (c < 0) throw new Error('IPv6 نامعتبر');
    host = au.slice(0, c + 1);
    if (au.charAt(c + 1) === ':') port = au.slice(c + 2);
  } else {
    const c2 = au.lastIndexOf(':');
    if (c2 > 0) { host = au.slice(0, c2); port = au.slice(c2 + 1); }
  }
  return { host, port };
}

function splitUrl(raw, skip) {
  let b = raw.slice(skip), frag = '';
  let qi = b.indexOf('?'), hi = -1;
  if (qi >= 0) hi = b.indexOf('#', qi); else hi = b.indexOf('#');
  if (hi >= 0) { frag = b.slice(hi + 1); b = b.slice(0, hi); }
  let q = '', x = b.indexOf('?');
  if (x >= 0) { q = b.slice(x + 1); b = b.slice(0, x); }
  return { body: b, q, frag };
}

export function parseVlessReal(raw) {
  const s = splitUrl(raw, 8);
  const a = s.body.lastIndexOf('@');
  if (a < 0) throw new Error('@ وجود ندارد');
  const id = dec(s.body.slice(0, a)).trim(), au = s.body.slice(a + 1).trim();
  if (!UUID_RE.test(id)) throw new Error('UUID نامعتبر');
  const hp = parseAuth(au);
  return { proto: 'vless', id, host: hp.host, port: hp.port, p: pq(s.q), f: s.frag };
}

export function parseTrojanReal(raw) {
  const s = splitUrl(raw, 9);
  const a = s.body.lastIndexOf('@');
  if (a < 0) throw new Error('@ وجود ندارد');
  const pass = dec(s.body.slice(0, a)).trim(), au = s.body.slice(a + 1).trim();
  if (!pass) throw new Error('رمز عبور خالی');
  const hp = parseAuth(au);
  return { proto: 'trojan', pass, host: hp.host, port: hp.port, p: pq(s.q), f: s.frag };
}

function buildVlessReal(c) {
  const qs = buildQS(c.p);
  return `vless://${c.id}@${c.host}${c.port ? ':' + c.port : ''}${qs ? '?' + qs : ''}${c.f ? '#' + c.f : ''}`;
}
function buildTrojanReal(c) {
  const qs = buildQS(c.p);
  return `trojan://${encodeURIComponent(c.pass)}@${c.host}${c.port ? ':' + c.port : ''}${qs ? '?' + qs : ''}${c.f ? '#' + c.f : ''}`;
}

function fmOf(raw) {
  const t = String(raw || '').trim() || FM_STR;
  try { return JSON.stringify(JSON.parse(t)); } catch { throw new Error('FinalMask JSON نامعتبر'); }
}

function applyParams(c, o) {
  if (o.adr) c.host = o.adr;
  if (o.port) c.port = String(o.port);
  setParam(c.p, 'fp', o.fp || DEFAULTS.fp);
  setParam(c.p, 'cs', o.cs || DEFAULTS.cs);
  setParam(c.p, 'fm', fmOf(o.fm));
  if (o.sni) setParam(c.p, 'sni', o.sni);
  if (o.host) setParam(c.p, 'host', o.host);
}

/**
 * The real optimize() entry point — parses a single config line,
 * replaces only {address, fp, cs, fm} (and optionally port/sni/host
 * as an app-level extension), and rebuilds the URL with the exact
 * real parameter order. Any other protocol is passed through
 * untouched, exactly like the reference implementation.
 */
export function optimizeConfigLine(raw, o = {}) {
  const l = String(raw || '').trim();
  if (/^vless:\/\//i.test(l)) {
    const cv = parseVlessReal(l);
    applyParams(cv, o);
    return buildVlessReal(cv);
  }
  if (/^trojan:\/\//i.test(l)) {
    const ct = parseTrojanReal(l);
    applyParams(ct, o);
    return buildTrojanReal(ct);
  }
  if (PROTO_START_RE.test(l)) return l;
  throw new Error('پروتکل ناشناخته یا نامعتبر');
}

// ---------------------------------------------------------------------------
// Real base64 subscription decode/extract (identical logic to reference tool)
// ---------------------------------------------------------------------------

export function b64decodeSmart(s) {
  try {
    let t = s.replace(/[\r\n\t ]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    let o = '';
    for (let i = 0; i < bin.length; i++) o += '%' + ('00' + bin.charCodeAt(i).toString(16)).slice(-2);
    return decodeURIComponent(o);
  } catch { return ''; }
}

export function extractConfigLines(text) {
  const found = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    const l = line.trim();
    if (PROTO_START_RE.test(l)) found.push(l);
  });
  return found;
}

export function extractConfigs(text) {
  const t = String(text || '');
  const direct = extractConfigLines(t);
  if (direct.length) return direct;
  const decoded = b64decodeSmart(t);
  if (decoded) {
    const fromDecoded = extractConfigLines(decoded);
    if (fromDecoded.length) return fromDecoded;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Real robust subscription fetcher — same multi-proxy fallback chain and
// JSON/base64/ZEUS-format auto-detection as the reference tool. When a
// Cloudflare Worker is configured it is tried first (fastest, most
// reliable, no third-party CORS proxy needed); the public CORS proxies
// remain as genuine fallbacks exactly like the original implementation.
// ---------------------------------------------------------------------------

const PUBLIC_CORS_PROXIES = [
  { prefix: '', label: 'direct' },
  { prefix: 'https://corsproxy.io/?', label: 'corsproxy.io' },
  { prefix: 'https://api.allorigins.win/raw?url=', label: 'allorigins' },
  { prefix: 'https://proxy.cors.sh/', label: 'cors.sh' },
  { prefix: 'https://thingproxy.freeboard.io/fetch/', label: 'thingproxy' }
];

function fetchWithTimeout(u, ms) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const t = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, ms);
    fetch(u, { signal: controller.signal }).then(r => { clearTimeout(t); resolve(r); }).catch(e => { clearTimeout(t); reject(e); });
  });
}

function attemptFetch(targetUrl, retriesLeft) {
  return fetchWithTimeout(targetUrl, 10000)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .catch(err => {
      if (retriesLeft > 0) {
        return new Promise(res => setTimeout(res, 800)).then(() => attemptFetch(targetUrl, retriesLeft - 1));
      }
      throw err;
    });
}

function extractFromRawText(txt) {
  const all = [];
  const trimmed = txt.trim();

  // ZEUS-style / generic JSON subscription format: walk the object tree
  // looking for either raw config lines or base64-encoded blobs.
  if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
    try {
      const json = JSON.parse(trimmed);
      const walk = (obj) => {
        if (!obj) return;
        if (typeof obj === 'string') {
          if (PROTO_START_RE.test(obj)) all.push(obj);
          else {
            const d = b64decodeSmart(obj);
            if (d) extractConfigLines(d).forEach(l => all.push(l));
            else extractConfigLines(obj).forEach(l => all.push(l));
          }
        } else if (Array.isArray(obj)) {
          obj.forEach(walk);
        } else if (typeof obj === 'object') {
          Object.values(obj).forEach(walk);
        }
      };
      walk(json);
      if (all.length) return all;
    } catch { /* not JSON, fall through */ }
  }

  extractConfigLines(trimmed).forEach(l => all.push(l));
  const d = b64decodeSmart(trimmed);
  if (d) extractConfigLines(d).forEach(l => all.push(l));

  const seen = {}, unique = [];
  all.forEach(l => { if (!seen[l]) { seen[l] = 1; unique.push(l); } });
  return unique;
}

/**
 * Fetch a subscription URL and return the decoded array of raw config
 * lines. Tries, in order: (1) your configured Cloudflare Worker proxy
 * — real, CORS-safe, no third party involved; (2) a direct fetch; (3) a
 * chain of public CORS proxies, exactly matching the reference tool's
 * fallback behavior for when a subscription host is filtered/blocked.
 */
export async function fetchSubscriptionSmart(url, workerUrl) {
  if (workerUrl) {
    try {
      const res = await fetchWithTimeout(`${workerUrl.replace(/\/$/, '')}/api/proxy-fetch?url=${encodeURIComponent(url)}`, 12000);
      if (res.ok) {
        const txt = await res.text();
        const lines = extractFromRawText(txt);
        if (lines.length) return { lines, via: 'worker' };
      }
    } catch { /* fall through to public proxy chain */ }
  }

  async function tryProxy(idx) {
    if (idx >= PUBLIC_CORS_PROXIES.length) throw new Error('همه روش‌های دریافت (مستقیم و پراکسی‌های عمومی) ناموفق بودند');
    const p = PUBLIC_CORS_PROXIES[idx];
    const target = p.prefix ? p.prefix + encodeURIComponent(url) : url;
    try {
      const txt = await attemptFetch(target, 1);
      return { txt, via: p.label };
    } catch {
      return tryProxy(idx + 1);
    }
  }

  const { txt, via } = await tryProxy(0);
  const lines = extractFromRawText(txt);
  if (!lines.length) throw new Error('کانفیگ معتبری در پاسخ سابسکریپشن پیدا نشد');
  return { lines, via };
}
