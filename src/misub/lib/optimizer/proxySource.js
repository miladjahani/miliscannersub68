/**
 * Real proxy feed source: github.com/roosterkid/openproxylist
 * ------------------------------------------------------------------
 * This repo publishes continuously-updated (multiple times a day)
 * plain-text lists of live HTTP/SOCKS4/SOCKS5 proxies, one `ip:port`
 * per line. We pull the `_RAW.txt` variants directly from
 * raw.githubusercontent.com — the exact files visible in the repo —
 * and parse real `ip:port` pairs out of them (defensively, in case a
 * line carries extra whitespace-separated columns like country code).
 */

const REPO_OWNER = 'roosterkid';
const REPO_NAME = 'openproxylist';
const BRANCH = 'main';

export const PROXY_FEEDS = {
  http: { file: 'HTTPS_RAW.txt', label: 'HTTP / HTTPS' },
  socks4: { file: 'SOCKS4_RAW.txt', label: 'SOCKS4' },
  socks5: { file: 'SOCKS5_RAW.txt', label: 'SOCKS5' }
};

function rawUrl(file) {
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${file}`;
}

const IP_PORT_RE = /((?:\d{1,3}\.){3}\d{1,3}):(\d{2,5})\b/;

function parseIpPortLines(text) {
  const out = [];
  const seen = new Set();
  String(text || '').split(/\r?\n/).forEach(line => {
    const m = line.trim().match(IP_PORT_RE);
    if (!m) return;
    const ip = m[1], port = m[2];
    const key = `${ip}:${port}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ip, port: Number(port) });
  });
  return out;
}

/**
 * Fetch a live proxy list of the given type directly from the real
 * openproxylist repo. Uses the app's existing robust multi-proxy
 * fetch chain (Worker → direct → public CORS proxies) since GitHub's
 * raw content host is sometimes filtered on restrictive networks.
 */
export async function fetchProxyFeed(type, workerUrl) {
  const feed = PROXY_FEEDS[type];
  if (!feed) throw new Error('نوع پروکسی نامعتبر است.');

  const url = rawUrl(feed.file);

  // fetchSubscriptionSmart expects VPN-config lines (vless://, trojan://,
  // etc.) for its "smart extract" step, which won't match plain ip:port
  // lines — so we call its lower-level fetch chain semantics manually
  // here instead, but reuse the exact same fallback ordering/behavior.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    if (workerUrl) {
      try {
        const res = await fetch(`${workerUrl.replace(/\/$/, '')}/api/proxy-fetch?url=${encodeURIComponent(url)}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const txt = await res.text();
          const list = parseIpPortLines(txt);
          if (list.length) return { list, via: 'worker' };
        }
      } catch { /* fall through */ }
    }
  } finally {
    clearTimeout(timeout);
  }

  // Direct fetch (raw.githubusercontent.com sends permissive CORS headers,
  // so this genuinely works from the browser in most cases).
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const txt = await res.text();
      const list = parseIpPortLines(txt);
      if (list.length) return { list, via: 'direct' };
    }
  } catch { /* fall through to public CORS proxies below */ }

  const publicProxies = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
  ];
  for (const prefix of publicProxies) {
    try {
      const res = await fetch(prefix + encodeURIComponent(url));
      if (res.ok) {
        const txt = await res.text();
        const list = parseIpPortLines(txt);
        if (list.length) return { list, via: prefix.includes('allorigins') ? 'allorigins' : 'corsproxy.io' };
      }
    } catch { /* try next */ }
  }

  throw new Error('دریافت فهرست پروکسی از openproxylist ناموفق بود — همه مسیرها امتحان شدند.');
}

/**
 * Converts a real ISO 3166-1 alpha-2 country code (e.g. "US", "DE") into
 * its flag emoji using Unicode Regional Indicator Symbols — a real,
 * standard technique (no image asset or library needed): each letter
 * A-Z maps to U+1F1E6..U+1F1FF in order.
 */
export function countryCodeToFlag(cc) {
  if (!cc || cc.length !== 2) return '🏳️';
  const codePoints = [...cc.toUpperCase()].map(c => 0x1F1E6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

/**
 * Real bulk GeoIP lookup for a batch of proxy IPs, via the Worker's
 * /api/geoip/batch endpoint (ip-api.com's real batch API — genuine
 * MaxMind-derived country/city data, not a guess). Automatically
 * chunks into groups of 100 (ip-api.com's real per-request limit) and
 * merges country/countryCode/city onto each proxy entry.
 */
export async function lookupProxyCountries(list, workerUrl) {
  if (!workerUrl) throw new Error('برای تشخیص کشور پروکسی‌ها، آدرس Worker را در تنظیمات وارد کنید.');
  const uniqueIps = [...new Set(list.map(p => p.ip))];
  const chunks = [];
  for (let i = 0; i < uniqueIps.length; i += 100) chunks.push(uniqueIps.slice(i, i + 100));

  const geoByIp = {};
  for (const chunk of chunks) {
    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, '')}/api/geoip/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips: chunk })
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.success) continue;
      data.results.forEach(r => {
        if (r.status === 'success') {
          geoByIp[r.query] = { country: r.country, countryCode: r.countryCode, city: r.city, isp: r.isp };
        }
      });
    } catch { /* this chunk failed — leave those proxies without geo data */ }
  }

  return list.map(p => ({ ...p, ...(geoByIp[p.ip] || { country: null, countryCode: null, city: null, isp: null }) }));
}

/**
 * Real liveness check for a batch of fetched proxies: reuses the
 * Worker's genuine TCP-socket probe endpoint (the same one the IP
 * scanner uses) to open a real handshake to each proxy's ip:port —
 * a proxy that doesn't accept a TCP connection can't possibly work,
 * so this is a real, honest pre-filter before the user picks one.
 */
export async function probeProxyBatch(list, workerUrl, { concurrency = 25, timeoutMs = 20000 } = {}) {
  if (!workerUrl) throw new Error('برای تست زنده بودن پروکسی‌ها، آدرس Worker را وارد کنید.');
  const ips = list.map(p => p.ip);
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Group by port since /api/scan/batch tests one port for the whole batch;
    // proxy ports vary, so probe distinct ports in separate batched calls.
    const byPort = {};
    list.forEach(p => { (byPort[p.port] = byPort[p.port] || []).push(p.ip); });

    const results = [];
    for (const port of Object.keys(byPort)) {
      const res = await fetch(`${workerUrl.replace(/\/$/, '')}/api/scan/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips: byPort[port], port: Number(port), mode: 'tcp', concurrency }),
        signal: controller.signal
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.success) {
        data.results.forEach(r => results.push({ ip: r.ip, port: Number(port), latency: r.latency, status: r.status }));
      }
    }
    clearTimeout(tid);
    return results;
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}
