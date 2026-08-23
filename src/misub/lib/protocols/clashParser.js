import { parseNode } from './index';

export function parseClashYamlNodes(yamlStr) {
  if (!yamlStr || typeof yamlStr !== 'string') return [];
  if (!yamlStr.includes('proxies:')) return [];

  const results = [];
  try {
    const lines = yamlStr.split('\n');
    let inProxies = false;
    let currentProxy = {};

    for (let line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('proxies:')) {
        inProxies = true;
        continue;
      }
      if (inProxies && (trimmed.startsWith('proxy-groups:') || trimmed.startsWith('rules:') || trimmed.startsWith('rule-providers:'))) {
        if (currentProxy.server && (currentProxy.uuid || currentProxy.password || currentProxy.type)) {
          results.push(mapClashProxyToNode(currentProxy));
        }
        break;
      }

      if (inProxies) {
        if (trimmed.startsWith('- name:') || trimmed.startsWith('- {name:')) {
          if (currentProxy.server && (currentProxy.uuid || currentProxy.password || currentProxy.type)) {
            results.push(mapClashProxyToNode(currentProxy));
          }
          currentProxy = {};
        }

        const match = trimmed.match(/^[-]?\s*([a-zA-Z0-9_-]+):\s*["']?([^"']+)["']?/);
        if (match) {
          currentProxy[match[1]] = match[2].trim();
        }
      }
    }

    if (currentProxy.server && (currentProxy.uuid || currentProxy.password || currentProxy.type)) {
      results.push(mapClashProxyToNode(currentProxy));
    }
  } catch (e) {
    console.warn('Clash YAML parse error:', e);
  }

  return results;
}

function mapClashProxyToNode(item) {
  const proto = (item.type || 'vless').toLowerCase();
  const server = item.server || '';
  const port = item.port || '443';
  const name = item.name || `${proto.toUpperCase()}-${server}:${port}`;
  const uuid = item.uuid || item.password || '';
  const tls = item.tls === 'true' || item.tls === true ? 'tls' : 'none';
  const sni = item.servername || item.sni || server;
  const host = item.host || sni || server;
  const path = item.path || '/';
  const network = item.network || 'ws';

  const params = new URLSearchParams();
  params.set('type', network);
  params.set('security', tls);
  params.set('sni', sni);
  params.set('host', host);
  params.set('path', path);

  const raw = `${proto}://${uuid}@${server}:${port}?${params.toString()}#${encodeURIComponent(name)}`;
  return parseNode(raw);
}
