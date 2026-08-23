export function parseTrojan(uri) {
  const parts = uri.replace('trojan://', '').split('#');
  const hash = parts[1] ? decodeURIComponent(parts[1]) : '';
  const [authHostPort, queryStr = ''] = parts[0].split('?');
  const [auth, hostPort] = authHostPort.split('@');
  const [address, port] = (hostPort || '').split(':');

  const params = new URLSearchParams(queryStr);
  return {
    id: 'trojan_' + Math.random().toString(36).substr(2, 9),
    protocol: 'trojan',
    raw: uri,
    name: hash || `Trojan-${address}:${port || 443}`,
    auth,
    address,
    port: port || '443',
    host: params.get('host') || address,
    sni: params.get('sni') || params.get('host') || address,
    path: params.get('path') || '/',
    type: params.get('type') || 'ws',
    security: 'tls',
    params
  };
}

export function buildTrojan(node, options = {}) {
  const targetIp = options.cleanIp || node.address;
  const targetPort = options.cleanPort || node.port;
  const targetHost = options.customSni || node.host;
  const targetSni = options.customSni || node.sni || node.host;

  const params = new URLSearchParams(node.params || '');
  if (targetHost) params.set('host', targetHost);
  if (targetSni) params.set('sni', targetSni);

  let name = node.name || 'Trojan-Node';
  if (options.prefix) name = `${options.prefix} ${name}`;

  return `trojan://${node.auth}@${targetIp}:${targetPort}?${params.toString()}#${encodeURIComponent(name)}`;
}
