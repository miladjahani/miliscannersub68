export function getWorkerUrl() {
  return (
    localStorage.getItem('cf_hub_worker_url') ||
    localStorage.getItem('cf_worker_url') ||
    ''
  ).trim().replace(/\/$/, '');
}

export function setWorkerUrl(url) {
  const clean = (url || '').trim().replace(/\/$/, '');
  localStorage.setItem('cf_hub_worker_url', clean);
  localStorage.setItem('cf_worker_url', clean);
}

export async function proxyFetch(targetUrl, userAgent) {
  const cleanUrl = targetUrl.trim();
  const worker = getWorkerUrl();

  // 1. Try Cloudflare Worker First
  if (worker) {
    try {
      const res = await fetch(`${worker}/api/proxy-fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl, userAgent: userAgent || 'v2rayNG/1.8.12 (MiSub)' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data && data.data.length > 5) {
          return data.data;
        }
      }
    } catch {}
  }

  // 2. Direct / Fallback Proxies
  const proxies = [
    cleanUrl,
    `https://corsproxy.io/?${encodeURIComponent(cleanUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`
  ];

  for (const target of proxies) {
    try {
      const res = await fetch(target, { headers: { 'User-Agent': userAgent || 'v2rayNG/1.8.12' } });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 10) {
          return text.trim();
        }
      }
    } catch {}
  }

  throw new Error('عدم دسترسی به لینک سابسکریپشن. لطفاً آدرس Cloudflare Worker خود را در تنظیمات وارد کنید.');
}
