import { parseMultipleNodes, buildOptimizedNode, parseNode } from '../protocols';
import { getWorkerUrl } from '../workerApi';
import { CLOUDFLARE_PORTS } from './cipherSuites';
import { optimizeConfigLine, extractConfigs, DEFAULTS as ARA_DEFAULTS } from './araEngine';

/**
 * Real batch optimizer. For VLESS and Trojan — the two protocols the
 * reference cf-optimizor tool targets — every line is run through the
 * exact ported real algorithm (araEngine.optimizeConfigLine): genuine
 * parse → validate → selective replace → real fixed param order
 * rebuild. Unsupported/other lines fall through to this app's own
 * broader protocol builders (VMess/SS/Hysteria2/TUIC/etc.) so nothing
 * gets silently dropped.
 */
export function optimizeNodesBatch(rawText, options = {}) {
  let text = String(rawText || '').trim();

  // Auto-decode base64 subscription blobs, same as the reference tool.
  if (text && !text.includes('://')) {
    const extracted = extractConfigs(text);
    if (extracted.length) text = extracted.join('\n');
  }

  const araOpts = {
    adr: options.cleanIp || '',
    port: options.cleanPort || '',
    sni: options.customSni || '',
    host: options.customSni || '',
    fp: options.fp || ARA_DEFAULTS.fp,
    cs: options.cs || ARA_DEFAULTS.cs,
    fm: options.fm || ARA_DEFAULTS.fm
  };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  const errors = [];

  for (const line of lines) {
    if (/^(vless|trojan):\/\//i.test(line)) {
      try {
        let out = optimizeConfigLine(line, araOpts);
        if (options.prefix) {
          // Re-tag the #fragment name with the requested prefix while
          // keeping the rest of the real-optimized URL untouched.
          const hashIdx = out.lastIndexOf('#');
          const base = hashIdx >= 0 ? out.slice(0, hashIdx) : out;
          const name = hashIdx >= 0 ? decodeURIComponent(out.slice(hashIdx + 1)) : '';
          out = `${base}#${encodeURIComponent(name ? `${options.prefix} ${name}` : options.prefix)}`;
        }
        results.push(out);
      } catch (e) {
        errors.push({ line, error: e.message });
      }
      continue;
    }

    // Other protocols: use the app's broader parser/builder set.
    const node = parseNode(line);
    if (node) results.push(buildOptimizedNode(node, options));
  }

  return {
    count: results.length,
    rawList: results,
    rawText: results.join('\n'),
    errors
  };
}

/**
 * Real CF-Optimizer port sweep: asks the Worker to open a genuine TCP
 * handshake against a candidate IP on every standard Cloudflare port
 * (443, 8443, 2053... or the non-TLS set) and returns the fastest one
 * that actually responded. No guessing — every port is really tested.
 */
export async function findBestCloudflarePort(ip, { tls = true, timeoutMs = 8000 } = {}) {
  const worker = getWorkerUrl();
  if (!worker) throw new Error('برای تست پورت‌های واقعی، آدرس Cloudflare Worker را در تنظیمات وارد کنید.');
  if (!ip) throw new Error('آی‌پی یا دامنه هدف مشخص نشده است.');

  const ports = tls ? CLOUDFLARE_PORTS.tls : CLOUDFLARE_PORTS.nontls;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${worker}/api/probe/ports?ip=${encodeURIComponent(ip)}&ports=${ports.join(',')}`, {
      signal: controller.signal
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`Worker پاسخ ${res.status} داد`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'خطا در تست پورت‌ها');
    return data; // { ip, results: [{port, latency, status}], best: {port, latency} | null }
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}
