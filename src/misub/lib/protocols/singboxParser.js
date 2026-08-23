import { parseNode } from './index';

export function parseSingboxJsonNodes(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') return [];
  const results = [];

  try {
    const obj = JSON.parse(jsonStr.trim());
    const outbounds = Array.isArray(obj.outbounds) ? obj.outbounds : Array.isArray(obj) ? obj : [];

    for (const ob of outbounds) {
      if (['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic'].includes(ob.type)) {
        const proto = ob.type === 'shadowsocks' ? 'ss' : ob.type;
        const server = ob.server || '';
        const port = ob.server_port || 443;
        const name = ob.tag || `${proto.toUpperCase()}-${server}:${port}`;
        const uuid = ob.uuid || ob.password || '';
        const tls = ob.tls?.enabled ? 'tls' : 'none';
        const sni = ob.tls?.server_name || server;
        const host = ob.transport?.headers?.Host || sni;
        const path = ob.transport?.path || '/';
        const network = ob.transport?.type || 'ws';

        const params = new URLSearchParams();
        params.set('type', network);
        params.set('security', tls);
        params.set('sni', sni);
        params.set('host', host);
        params.set('path', path);

        const raw = `${proto}://${uuid}@${server}:${port}?${params.toString()}#${encodeURIComponent(name)}`;
        const node = parseNode(raw);
        if (node) results.push(node);
      }
    }
  } catch {}

  return results;
}
