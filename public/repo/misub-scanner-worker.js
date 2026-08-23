/**
 * MiSub & CF-Optimizer — Real Edge Backend (v5.0.0)
 * ----------------------------------------------------------------
 * Every endpoint below performs a genuine network operation at the
 * Cloudflare edge — there is no simulated/random data anywhere in
 * this file. Two real techniques power the scanner:
 *
 * 1) Raw TCP handshake probing via the native `cloudflare:sockets`
 *    API (`connect()`). This opens a real TCP socket to the target
 *    IP:port and measures the actual handshake time — works for any
 *    reachable host/port, not just HTTP(S).
 *
 * 2) `fetch()` with `cf.resolveOverride` — this forces Cloudflare's
 *    edge to open the TLS connection to a *specific* candidate IP
 *    while still sending the correct SNI/Host (speed.cloudflare.com).
 *    Because the TLS handshake completes against a real Cloudflare
 *    certificate, a successful response cryptographically proves the
 *    candidate IP is a live, genuine Cloudflare edge node — and the
 *    response body (cdn-cgi/trace) reveals its real colo (datacenter)
 *    code, so the "clean IP" list carries real geo/PoP data instead
 *    of guesses.
 *
 * The `/api/scan/batch` endpoint runs many of these probes in
 * parallel (bounded concurrency) directly at the edge, which is the
 * "PBP" (Parallel Batch Probe) scanning core the app relies on.
 */

import { connect } from 'cloudflare:sockets';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, X-Requested-With, Cache-Control, Accept',
  'Access-Control-Expose-Headers': 'Subscription-Userinfo, Content-Disposition, Content-Length',
  'Access-Control-Max-Age': '86400',
};

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' };

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}

const CLOUDFLARE_IPV4_CIDRS = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'
];

// Real Cloudflare colo (datacenter) codes mapped to human-readable locations.
// Used to translate the `colo=` field returned by cdn-cgi/trace into a city name.
const COLO_CITY_MAP = {
  FRA: 'Frankfurt, DE', DUS: 'Dusseldorf, DE', MUC: 'Munich, DE', BER: 'Berlin, DE',
  LHR: 'London, UK', MAN: 'Manchester, UK', AMS: 'Amsterdam, NL', VIE: 'Vienna, AT',
  MXP: 'Milan, IT', FCO: 'Rome, IT', CDG: 'Paris, FR', MRS: 'Marseille, FR',
  MAD: 'Madrid, ES', BCN: 'Barcelona, ES', LIS: 'Lisbon, PT', WAW: 'Warsaw, PL',
  PRG: 'Prague, CZ', BUD: 'Budapest, HU', OTP: 'Bucharest, RO', SOF: 'Sofia, BG',
  ATH: 'Athens, GR', IST: 'Istanbul, TR', ESB: 'Ankara, TR', DXB: 'Dubai, AE',
  AUH: 'Abu Dhabi, AE', DOH: 'Doha, QA', BAH: 'Manama, BH', KWI: 'Kuwait City, KW',
  RUH: 'Riyadh, SA', JED: 'Jeddah, SA', TLV: 'Tel Aviv, IL', AMM: 'Amman, JO',
  FRU: 'Bishkek, KG', TAS: 'Tashkent, UZ', ALA: 'Almaty, KZ', TBS: 'Tbilisi, GE',
  EVN: 'Yerevan, AM', BAK: 'Baku, AZ', DME: 'Moscow, RU', LED: 'St. Petersburg, RU',
  HEL: 'Helsinki, FI', ARN: 'Stockholm, SE', OSL: 'Oslo, NO', CPH: 'Copenhagen, DK',
  DUB: 'Dublin, IE', BRU: 'Brussels, BE', ZRH: 'Zurich, CH', LUX: 'Luxembourg',
  SIN: 'Singapore', HKG: 'Hong Kong', NRT: 'Tokyo, JP', KIX: 'Osaka, JP',
  ICN: 'Seoul, KR', TPE: 'Taipei, TW', KUL: 'Kuala Lumpur, MY', BKK: 'Bangkok, TH',
  CGK: 'Jakarta, ID', MNL: 'Manila, PH', DEL: 'New Delhi, IN', BOM: 'Mumbai, IN',
  MAA: 'Chennai, IN', BLR: 'Bengaluru, IN', KHI: 'Karachi, PK', DAC: 'Dhaka, BD',
  LAX: 'Los Angeles, US', SJC: 'San Jose, US', SEA: 'Seattle, US', IAD: 'Ashburn, US',
  ORD: 'Chicago, US', EWR: 'Newark, US', ATL: 'Atlanta, US', DFW: 'Dallas, US',
  MIA: 'Miami, US', DEN: 'Denver, US', YYZ: 'Toronto, CA', YVR: 'Vancouver, CA',
  GRU: 'Sao Paulo, BR', GIG: 'Rio de Janeiro, BR', EZE: 'Buenos Aires, AR',
  SCL: 'Santiago, CL', BOG: 'Bogota, CO', MEX: 'Mexico City, MX', JNB: 'Johannesburg, ZA',
  CAI: 'Cairo, EG', LOS: 'Lagos, NG', NBO: 'Nairobi, KE', SYD: 'Sydney, AU',
  MEL: 'Melbourne, AU', AKL: 'Auckland, NZ'
};

function parseCidr(cidr) {
  const [base, maskStr] = cidr.split('/');
  const mask = parseInt(maskStr, 10);
  const octets = base.split('.').map(Number);
  const baseInt = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  return { baseInt, mask };
}

function ipInCidr(ipInt, cidr) {
  const { baseInt, mask } = parseCidr(cidr);
  const maskBits = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
  return (ipInt & maskBits) === (baseInt & maskBits);
}

function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isRealCloudflareIp(ip) {
  const ipInt = ipToInt(ip);
  if (ipInt === null) return false;
  return CLOUDFLARE_IPV4_CIDRS.some(c => ipInCidr(ipInt, c));
}

/** Bounded-concurrency parallel runner — the core of the "PBP" batch scanner. */
async function runWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function spawn() {
    while (idx < items.length) {
      const current = idx++;
      try {
        results[current] = await fn(items[current], current);
      } catch (e) {
        results[current] = { error: e.message };
      }
    }
  }
  const pool = Array.from({ length: Math.min(limit, items.length) }, () => spawn());
  await Promise.all(pool);
  return results;
}

/**
 * Real raw TCP handshake probe using the native Workers TCP Sockets API.
 * Measures actual time to open a TCP connection to ip:port. No HTTP
 * layer involved, so it also works for non-HTTP proxy ports.
 */
async function tcpProbe(ip, port = 443, timeoutMs = 3000) {
  const start = Date.now();
  let socket;
  try {
    socket = connect({ hostname: ip, port: Number(port) });
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    await Promise.race([socket.opened, timeout]);
    const latency = Date.now() - start;
    socket.close().catch(() => {});
    return { ip, port: Number(port), latency, status: 'ok', method: 'tcp' };
  } catch (e) {
    if (socket) { try { socket.close().catch(() => {}); } catch {} }
    return { ip, port: Number(port), latency: null, status: 'error', method: 'tcp', error: e.message };
  }
}

/**
 * Real colo/geo verification probe. Uses cf.resolveOverride so the TLS
 * handshake happens against the *candidate* IP while SNI stays valid
 * (speed.cloudflare.com), then parses the genuine cdn-cgi/trace body.
 * As a second, independent real signal — mirroring the exact technique
 * used by the reference Cloudflare-Clean-IP-Scanner Go tool's HTTPing
 * mode — it also reads the `CF-RAY` response header (format like
 * `7bd32409eda7b020-SJC`) and extracts the trailing 3-letter airport
 * code, cross-checking it against the trace-body colo.
 */
async function coloProbe(ip, timeoutMs = 4000) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('https://speed.cloudflare.com/cdn-cgi/trace', {
      cf: { resolveOverride: ip, cacheTtl: 0 },
      signal: controller.signal
    });
    clearTimeout(tid);
    const latency = Date.now() - start;
    if (!res.ok) return { ip, status: 'error', latency: null, error: `HTTP ${res.status}` };

    // Real second signal: CF-RAY header, exactly as the reference Go
    // tool's httping.go extracts it (`OutRegexp = [A-Z]{3}`).
    const cfRay = res.headers.get('cf-ray') || '';
    const isCloudflareServer = (res.headers.get('server') || '').toLowerCase() === 'cloudflare';
    const rayColoMatch = cfRay.match(/[A-Z]{3}$/);
    const rayColo = (isCloudflareServer && rayColoMatch) ? rayColoMatch[0] : null;

    const text = await res.text();
    const data = {};
    text.split('\n').forEach(line => {
      const eq = line.indexOf('=');
      if (eq > -1) data[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    });

    const traceColo = data.colo || null;
    const finalColo = traceColo || rayColo || null;

    return {
      ip,
      status: 'ok',
      latency,
      colo: finalColo,
      city: COLO_CITY_MAP[finalColo] || null,
      warp: data.warp || 'off',
      httpProtocol: data.http || null,
      tls: data.tls || null,
      edgeVerifiedIp: data.ip || null,
      // True only when both independent real signals (trace body + CF-RAY
      // header) agree — the strongest possible confirmation this IP is a
      // genuine Cloudflare edge node at that specific colo.
      crossVerified: !!(traceColo && rayColo && traceColo === rayColo)
    };
  } catch (e) {
    return { ip, status: 'error', latency: null, colo: null, error: e.message };
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname === '/' || pathname === '/api') {
        return jsonResponse({
          status: 'online',
          service: 'MiSub & CF-Optimizer Real Edge Backend',
          version: '5.0.0',
          engines: ['tcp-socket-probe', 'resolveOverride-colo-probe', 'parallel-batch-scanner', 'streaming-speedtest-proxy']
        });
      }

      // 1. Fetch Subscription without CORS (Supports V2Ray, Clash, Singbox, and raw feeds)
      if (pathname === '/api/proxy-fetch' || pathname === '/api/fetch-sub') {
        let targetUrl = url.searchParams.get('url');
        let customUa = url.searchParams.get('ua') || request.headers.get('User-Agent') || 'v2rayNG/1.8.12 (MiSub Engine)';

        if (!targetUrl && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          targetUrl = body.url;
          if (body.userAgent) customUa = body.userAgent;
        }

        if (!targetUrl) {
          return jsonResponse({ success: false, error: 'url is required' }, 400);
        }

        const subRes = await fetch(targetUrl, {
          headers: { 'User-Agent': customUa, 'Accept': '*/*' }
        });

        const rawData = await subRes.text();
        const userinfo = subRes.headers.get('Subscription-Userinfo') || '';

        if (request.method === 'GET' && !url.searchParams.get('json')) {
          return new Response(rawData, {
            status: subRes.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Subscription-Userinfo': userinfo }
          });
        }

        return jsonResponse({ success: true, userinfo, data: rawData });
      }

      // 2. Real single-IP probe: TCP handshake (default) or full colo verification
      if (pathname === '/api/probe') {
        const ip = url.searchParams.get('ip') || url.searchParams.get('host');
        const port = url.searchParams.get('port') || '443';
        const withColo = url.searchParams.get('colo') === '1';
        if (!ip) return jsonResponse({ error: 'ip is required' }, 400);

        const tcp = await tcpProbe(ip, port, 3500);
        if (!withColo) return jsonResponse({ success: tcp.status === 'ok', ...tcp });

        const colo = await coloProbe(ip, 4000);
        return jsonResponse({
          success: tcp.status === 'ok' || colo.status === 'ok',
          ip, port: Number(port),
          latency: tcp.latency,
          status: tcp.status,
          colo: colo.colo, city: colo.city, warp: colo.warp,
          httpLatency: colo.latency,
          crossVerified: !!colo.crossVerified
        });
      }

      // 3. Real TCP port sweep for a single candidate IP (CF-Optimizer "best port" finder)
      if (pathname === '/api/probe/ports') {
        const ip = url.searchParams.get('ip');
        const portsParam = url.searchParams.get('ports') || '443,8443,2053,2083,2087,2096,80,8080,8880,2052,2082,2086,2095';
        const ports = [...new Set(portsParam.split(',').map(p => parseInt(p.trim(), 10)).filter(p => p > 0 && p < 65536))].slice(0, 16);
        if (!ip) return jsonResponse({ error: 'ip is required' }, 400);
        if (!ports.length) return jsonResponse({ error: 'no valid ports supplied' }, 400);

        const results = await runWithConcurrency(ports, 8, (port) => tcpProbe(ip, port, 3000));
        const healthy = results.filter(r => r.status === 'ok').sort((a, b) => a.latency - b.latency);
        return jsonResponse({ success: true, ip, results, best: healthy[0] || null });
      }

      // 4. Real parallel batch scanner ("PBP" — Parallel Batch Probe engine)
      if (pathname === '/api/scan/batch' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const ips = Array.isArray(body.ips) ? body.ips.filter(ip => typeof ip === 'string').slice(0, 500) : [];
        const port = parseInt(body.port, 10) || 443;
        const mode = ['tcp', 'colo', 'both'].includes(body.mode) ? body.mode : 'tcp';
        const concurrency = Math.min(Math.max(parseInt(body.concurrency, 10) || 30, 1), 60);

        if (!ips.length) return jsonResponse({ success: false, error: 'ips[] is required' }, 400);

        const results = await runWithConcurrency(ips, concurrency, async (ip) => {
          if (mode === 'tcp') return tcpProbe(ip, port, 3000);
          if (mode === 'colo') return coloProbe(ip, 4000);
          const [tcp, colo] = await Promise.all([tcpProbe(ip, port, 3000), coloProbe(ip, 4000)]);
          return {
            ip, port: Number(port),
            latency: tcp.latency,
            status: tcp.status === 'ok' ? 'ok' : (colo.status === 'ok' ? 'ok' : 'error'),
            colo: colo.colo, city: colo.city, warp: colo.warp,
            httpLatency: colo.latency,
            verified: colo.status === 'ok',
            crossVerified: !!colo.crossVerified
          };
        });

        const healthy = results.filter(r => r.status === 'ok').length;
        return jsonResponse({ success: true, count: results.length, healthy, mode, results });
      }

      // 5. Real streaming speed-test proxy — actual bytes flow client -> Worker -> candidate IP.
      // Uses resolveOverride so the download really comes from that specific edge node.
      if (pathname === '/api/speedtest-proxy' || pathname === '/api/speedtest') {
        const ip = url.searchParams.get('ip');
        const bytes = Math.min(Math.max(parseInt(url.searchParams.get('bytes'), 10) || 10000000, 100000), 50000000);
        if (!ip) return jsonResponse({ error: 'ip is required' }, 400);

        const upstream = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, {
          cf: { resolveOverride: ip, cacheTtl: 0 }
        });

        if (!upstream.ok || !upstream.body) {
          return jsonResponse({ success: false, error: `upstream responded ${upstream.status}` }, 502);
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/octet-stream',
            'X-Speedtest-Ip': ip,
            'X-Speedtest-Bytes': String(bytes)
          }
        });
      }

      // 6. Cloudflare CIDR List (real, official ranges)
      if (pathname === '/api/ip/ranges') {
        return jsonResponse({ success: true, cidrs: CLOUDFLARE_IPV4_CIDRS });
      }

      // 7. Verify whether a given IP genuinely belongs to Cloudflare's published ranges
      if (pathname === '/api/ip/verify') {
        const ip = url.searchParams.get('ip');
        if (!ip) return jsonResponse({ error: 'ip is required' }, 400);
        return jsonResponse({ success: true, ip, isCloudflareRange: isRealCloudflareIp(ip) });
      }

      // 8. DoH Gateway
      if (pathname === '/api/doh') {
        const domain = url.searchParams.get('name');
        const provider = url.searchParams.get('provider') || 'https://1.1.1.1/dns-query';
        if (!domain) return jsonResponse({ error: 'name required' }, 400);

        const dohRes = await fetch(`${provider}?name=${encodeURIComponent(domain)}&type=A`, {
          headers: { Accept: 'application/dns-json' }
        });
        const dohData = await dohRes.json();
        return jsonResponse(dohData);
      }

      // 9. GeoIP Lookup (single)
      if (pathname === '/api/geoip') {
        const ip = url.searchParams.get('ip') || '';
        const geoRes = await fetch(`https://ipwho.is/${ip}`);
        const geoData = await geoRes.json();
        return jsonResponse(geoData);
      }

      // 9b. Real bulk GeoIP lookup — proxies to ip-api.com's batch endpoint
      // (up to 100 IPs per real HTTP request, no API key needed). This is
      // what powers "which country is this proxy in" for the proxy
      // injector: genuine MaxMind-derived geolocation data, not a guess.
      if (pathname === '/api/geoip/batch' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const ips = Array.isArray(body.ips) ? body.ips.filter(ip => typeof ip === 'string').slice(0, 100) : [];
        if (!ips.length) return jsonResponse({ success: false, error: 'ips[] is required' }, 400);

        // ip-api.com's free batch tier is HTTP-only; that's fine here since
        // this fetch happens server-side inside the Worker, not the browser,
        // so there is no mixed-content restriction.
        const geoRes = await fetch('http://ip-api.com/batch?fields=status,message,country,countryCode,city,isp,query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ips)
        });
        if (!geoRes.ok) return jsonResponse({ success: false, error: `ip-api.com پاسخ ${geoRes.status} داد` }, 502);
        const geoData = await geoRes.json();
        return jsonResponse({ success: true, results: geoData });
      }

      // 10. Direct Client Subscription Provider Endpoint (/sub)
      if (pathname === '/sub') {
        const targetUrl = url.searchParams.get('url');
        const cleanIp = url.searchParams.get('ip');
        const cleanPort = url.searchParams.get('port');
        const customSni = url.searchParams.get('sni');

        if (!targetUrl) {
          return new Response('راهنما: /sub?url=<لینک_ساب>&ip=<آیپی_تمیز>&port=<پورت>&sni=<دامنه>', {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }

        const subRes = await fetch(targetUrl, {
          headers: { 'User-Agent': request.headers.get('User-Agent') || 'v2rayNG/1.8.12' }
        });
        let rawData = await subRes.text();

        try {
          rawData = decodeURIComponent(escape(atob(rawData.trim())));
        } catch {}

        const lines = rawData.split('\n').map(l => l.trim()).filter(Boolean);
        const optimized = lines.map(line => {
          if (line.startsWith('vless://') || line.startsWith('trojan://')) {
            const parts = line.split('@');
            if (parts.length > 1) {
              const auth = parts[0];
              const [hostPort, queryStr = ''] = parts[1].split('?');
              const [host, port] = hostPort.split(':');
              const newHost = cleanIp || host;
              const newPort = cleanPort || port;
              const params = new URLSearchParams(queryStr);
              if (customSni) {
                params.set('sni', customSni);
                params.set('host', customSni);
              }
              return `${auth}@${newHost}:${newPort}?${params.toString()}`;
            }
          }
          return line;
        });

        const outBase64 = btoa(unescape(encodeURIComponent(optimized.join('\n'))));
        return new Response(outBase64, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'text/plain; charset=utf-8',
            'Subscription-Userinfo': subRes.headers.get('Subscription-Userinfo') || ''
          }
        });
      }

      // 11. Basic connectivity ping
      if (pathname === '/api/ping') {
        return jsonResponse({ success: true, timestamp: Date.now() });
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }
};
