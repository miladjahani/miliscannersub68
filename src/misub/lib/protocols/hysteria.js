export function parseHysteria(uri) {
  const isHy2 = uri.startsWith('hysteria2://') || uri.startsWith('hy2://');
  const prefixStr = uri.startsWith('hysteria2://') ? 'hysteria2://' : uri.startsWith('hy2://') ? 'hy2://' : 'hysteria://';
  const parts = uri.replace(prefixStr, '').split('#');
  const hash = parts[1] ? decodeURIComponent(parts[1]) : '';
  const [authHostPort, queryStr = ''] = parts[0].split('?');
  const atSplit = authHostPort.split('@');
  const auth = atSplit.length > 1 ? atSplit[0] : '';
  const hostPort = atSplit.length > 1 ? atSplit[1] : atSplit[0];
  const [address, port] = (hostPort || '').split(':');
  const params = new URLSearchParams(queryStr);

  return {
    id: 'hy_' + Math.random().toString(36).substr(2, 9),
    protocol: isHy2 ? 'hysteria2' : 'hysteria',
    raw: uri,
    name: hash || `Hy2-${address}:${port || 443}`,
    auth,
    address,
    port: port || 443,
    sni: params.get('sni') || address,
    obfs: params.get('obfs') || '',
    params
  };
}

export function buildHysteria(node, options = {}) {
  const targetIp = options.cleanIp || node.address;
  const targetPort = options.cleanPort || node.port;
  const params = new URLSearchParams(node.params || '');
  if (options.customSni) params.set('sni', options.customSni);

  let name = node.name || 'Hysteria2-Node';
  if (options.prefix) name = `${options.prefix} ${name}`;

  return `hysteria2://${node.auth}@${targetIp}:${targetPort}?${params.toString()}#${encodeURIComponent(name)}`;
}
