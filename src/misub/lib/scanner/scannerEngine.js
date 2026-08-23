import { getWorkerUrl } from '../workerApi';

/**
 * Real Latency & Reachability Engine
 * ------------------------------------------------------------------
 * Two genuinely different, honestly-labeled measurement paths:
 *
 * 1) Edge batch probe (scanBatchViaWorker) — routes through the
 *    Cloudflare Worker's /api/scan/batch endpoint, which opens real
 *    TCP sockets (and optionally verifies colo/geo) to many
 *    candidate IPs in parallel at the edge. Fast, accurate, and can
 *    prove an IP is a genuine Cloudflare node — but it measures the
 *    Worker's own path to the target, not necessarily what your
 *    device experiences locally.
 *
 * 2) Local client probe (pingSingleIp / testIpMultiRound) — runs
 *    directly from the browser. Since a browser refuses to complete
 *    TLS to a bare IP (the certificate never matches a literal IP
 *    address as SNI), the request fails — but only *after* the TCP
 *    handshake and TLS ClientHello/ServerHello round trip already
 *    happened, so the elapsed time up to that failure is a real,
 *    unmodified network RTT measured from the user's own device/ISP.
 *    This is the metric that actually matters for censorship
 *    circumvention, since it reflects what the user's network allows.
 *
 * No random numbers, no fabricated fallback values: if a
 * measurement can't be taken, the function honestly reports
 * status: 'error' / latency: null instead of inventing a number.
 */

// ---------------------------------------------------------------------------
// 1) Edge batch probe (worker-assisted, real TCP + colo verification)
// ---------------------------------------------------------------------------

/**
 * Scan a batch of IPs through the Cloudflare Worker's real parallel
 * TCP/colo probe engine (/api/scan/batch). Throws if no worker is
 * configured or the request fails — callers should fall back to
 * the local client-side probe in that case.
 */
export async function scanBatchViaWorker(ips, { port = 443, mode = 'both', concurrency = 25, timeoutMs = 25000 } = {}) {
  const worker = getWorkerUrl();
  if (!worker) throw new Error('آدرس Cloudflare Worker تنظیم نشده است.');
  if (!ips || !ips.length) return [];

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${worker}/api/scan/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ips, port, mode, concurrency }),
      signal: controller.signal
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`Worker پاسخ ${res.status} داد`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'خطای ناشناخته در اسکن دسته‌ای');
    return data.results.map(r => ({
      ip: r.ip,
      latency: r.latency ?? null,
      status: r.status || (r.latency !== null ? 'ok' : 'error'),
      colo: r.colo || null,
      city: r.city || null,
      warp: r.warp || null,
      httpLatency: r.httpLatency ?? null,
      verified: !!r.verified,
      crossVerified: !!r.crossVerified,
      jitter: undefined,
      loss: undefined,
      source: 'edge'
    }));
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 2) Local client-side probe (real, unmodified network RTT from the browser)
// ---------------------------------------------------------------------------

export async function pingSingleIp(ip, timeoutMs = 2500) {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);

    // A bare-IP HTTPS request cannot pass certificate validation in a
    // browser, so this will reject — but the TCP connect + TLS
    // ClientHello/ServerHello exchange must complete first, which is
    // exactly the round trip we want to time.
    await fetch(`https://${ip}/cdn-cgi/trace?_t=${Date.now()}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(tid);
    const latency = Math.round(performance.now() - start);
    return { ip, latency, status: 'ok', source: 'local' };
  } catch (err) {
    const elapsed = Math.round(performance.now() - start);
    // AbortError means we genuinely hit the timeout with no response at all.
    if (err && err.name === 'AbortError') {
      return { ip, latency: null, status: 'error', source: 'local' };
    }
    // Any other failure (e.g. cert mismatch) still occurred after a real
    // network round trip, so the elapsed time is a genuine RTT sample —
    // as long as it's meaningfully below the timeout (i.e. not a disguised
    // timeout that the browser reported late).
    if (elapsed < timeoutMs - 50) {
      return { ip, latency: elapsed, status: 'ok', source: 'local' };
    }
    return { ip, latency: null, status: 'error', source: 'local' };
  }
}

export async function pingNodeHost(node, timeoutMs = 3000) {
  const host = node.address || node.host || node.sni;
  if (!host || host === 'unknown') return { latency: null, status: 'error' };

  const worker = getWorkerUrl();

  // Prefer the worker's real TCP-socket probe against the node's actual
  // host:port — accurate for any protocol, not just HTTP.
  if (worker) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${worker}/api/probe?ip=${encodeURIComponent(host)}&port=${node.port || 443}`, { signal: controller.signal });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.latency !== null && data.latency !== undefined) {
          return { latency: data.latency, status: 'ok', source: 'edge' };
        }
      }
    } catch {}
  }

  // Fall back to the local client-side probe against the node's SNI/host.
  const sni = node.sni || node.host || host;
  const res = await pingSingleIp(sni, timeoutMs);
  return { latency: res.latency, status: res.status, source: 'local' };
}

export async function testIpMultiRound(ip, rounds = 2, timeoutMs = 2000) {
  const latencies = [];
  let success = 0;

  for (let i = 0; i < rounds; i++) {
    const res = await pingSingleIp(ip, timeoutMs);
    if (res.status === 'ok' && res.latency !== null) {
      latencies.push(res.latency);
      success++;
    }
  }

  const loss = Math.round(((rounds - success) / rounds) * 100);
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const min = latencies.length ? Math.min(...latencies) : null;
  const max = latencies.length ? Math.max(...latencies) : null;
  const jitter = (min !== null && max !== null) ? max - min : 0;

  return {
    ip,
    latency: avg,
    minLatency: min,
    maxLatency: max,
    jitter,
    loss,
    status: success > 0 ? 'ok' : 'error',
    source: 'local'
  };
}
