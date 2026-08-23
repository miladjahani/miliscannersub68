import { getWorkerUrl } from '../workerApi';

export async function resolveDoH(domain, provider = 'https://cloudflare-dns.com/dns-query', timeoutMs = 4000) {
  const cleanDomain = domain.trim();
  if (!cleanDomain) return [];

  const worker = getWorkerUrl();

  // 1. Worker Proxy Gateway
  if (worker) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${worker}/api/doh?name=${encodeURIComponent(cleanDomain)}&provider=${encodeURIComponent(provider)}`, {
        signal: controller.signal
      });
      clearTimeout(tid);
      if (res.ok) {
        const json = await res.json();
        if (json.Answer && Array.isArray(json.Answer)) {
          return json.Answer.map(a => a.data).filter(Boolean);
        }
      }
    } catch {}
  }

  // 2. Direct CORS-Ready DoH Resolvers
  const dohEndpoints = [
    provider,
    'https://cloudflare-dns.com/dns-query',
    'https://dns.google/resolve'
  ];

  for (const ep of dohEndpoints) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      const separator = ep.includes('?') ? '&' : '?';
      const targetUrl = `${ep}${separator}name=${encodeURIComponent(cleanDomain)}&type=A`;

      const res = await fetch(targetUrl, {
        headers: { Accept: 'application/dns-json' },
        signal: controller.signal
      });
      clearTimeout(tid);

      if (res.ok) {
        const json = await res.json();
        if (json.Answer && Array.isArray(json.Answer)) {
          const ips = json.Answer.map(a => a.data).filter(d => /^\d+\.\d+\.\d+\.\d+$/.test(d));
          if (ips.length > 0) return ips;
        }
      }
    } catch {}
  }

  // Honest failure: no resolver responded, so report no results instead of
  // fabricating IPs. Callers should show "resolution failed" to the user.
  return [];
}
