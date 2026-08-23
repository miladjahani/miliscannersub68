export function parseTuic(uri) {
  const parts = uri.replace('tuic://', '').split('#');
  const hash = parts[1] ? decodeURIComponent(parts[1]) : '';
  const [authHostPort, queryStr = ''] = parts[0].split('?');
  const atSplit = authHostPort.split('@');
  const auth = atSplit.length > 1 ? atSplit[0] : '';
  const hostPort = atSplit.length > 1 ? atSplit[1] : atSplit[0];
  const [address, port] = (hostPort || '').split(':');
  const params = new URLSearchParams(queryStr);

  return {
    id: 'tuic_' + Math.random().toString(36).substr(2, 9),
    protocol: 'tuic',
    raw: uri,
    name: hash || `TUIC-${address}:${port || 8443}`,
    auth,
    address,
    port: port || 8443,
    sni: params.get('sni') || address,
    alpn: params.get('alpn') || 'h3',
    params
  };
}

export function buildTuic(node, options = {}) {
  const targetIp = options.cleanIp || node.address;
  const targetPort = options.cleanPort || node.port;
  const params = new URLSearchParams(node.params || '');
  if (options.customSni) params.set('sni', options.customSni);

  let name = node.name || 'TUIC-Node';
  if (options.prefix) name = `${options.prefix} ${name}`;

  return `tuic://${node.auth}@${targetIp}:${targetPort}?${params.toString()}#${encodeURIComponent(name)}`;
}
