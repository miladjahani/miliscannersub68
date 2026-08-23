import { getWorkerUrl } from '../workerApi';

/**
 * Real download-speed test.
 *
 * A browser cannot open a valid HTTPS connection directly to a bare
 * Cloudflare IP (no certificate matches a literal IP as SNI), so a
 * direct `fetch('https://<ip>/...')` for bytes never actually
 * transfers any payload — any "speed" computed from it is fake.
 *
 * Real technique: the Cloudflare Worker uses `cf.resolveOverride` to
 * open the download from the *specific* candidate IP while keeping a
 * valid SNI, then streams the response body straight back to the
 * browser unmodified. The client measures the real elapsed time to
 * receive the real bytes — genuinely reflects your device's path to
 * that IP through Cloudflare's network.
 */
export async function testDownloadSpeed(ip, downloadBytes = 5000000, timeoutMs = 15000) {
  const worker = getWorkerUrl();
  if (!worker) {
    return {
      ip, speedMbps: 0, speedMBs: 0, status: 'error',
      error: 'برای تست سرعت واقعی، ابتدا آدرس Cloudflare Worker را در تنظیمات وارد کنید.'
    };
  }

  const start = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${worker}/api/speedtest-proxy?ip=${encodeURIComponent(ip)}&bytes=${downloadBytes}`, {
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!res.ok || !res.body) {
      throw new Error(`Worker پاسخ ${res.status} داد`);
    }

    const reader = res.body.getReader();
    let received = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
    }
    clearTimeout(timeoutId);

    const duration = (performance.now() - start) / 1000;
    if (duration <= 0 || received === 0) {
      return { ip, speedMbps: 0, speedMBs: 0, status: 'error', error: 'داده‌ای دریافت نشد' };
    }

    const mbps = (received * 8) / (1024 * 1024 * duration);
    const mBs = received / (1024 * 1024 * duration);

    return {
      ip,
      speedMbps: parseFloat(mbps.toFixed(2)),
      speedMBs: parseFloat(mBs.toFixed(2)),
      bytesReceived: received,
      durationSec: parseFloat(duration.toFixed(2)),
      status: 'ok'
    };
  } catch (e) {
    clearTimeout(timeoutId);
    return { ip, speedMbps: 0, speedMBs: 0, status: 'error', error: e.message };
  }
}
