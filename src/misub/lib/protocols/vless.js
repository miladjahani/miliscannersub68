export function parseVless(uri) {
  const parts = uri.replace('vless://', '').split('#');
  const hash = parts[1] ? decodeURIComponent(parts[1]) : '';
  const [authHostPort, queryStr = ''] = parts[0].split('?');
  const [auth, hostPort] = authHostPort.split('@');
  const [address, port] = (hostPort || '').split(':');

  const params = new URLSearchParams(queryStr);
  return {
    id: 'vless_' + Math.random().toString(36).substr(2, 9),
    protocol: 'vless',
    raw: uri,
    name: hash || `VLESS-${address}:${port || 443}`,
    auth,
    address,
    port: port || '443',
    host: params.get('host') || address,
    sni: params.get('sni') || params.get('host') || address,
    path: params.get('path') || '/',
    type: params.get('type') || 'ws',
    security: params.get('security') || 'none',
    pbk: params.get('pbk') || '',
    sid: params.get('sid') || '',
    fp: params.get('fp') || 'chrome',
    flow: params.get('flow') || '',
    params
  };
}

export function buildVless(node, options = {}) {
  const targetIp = options.cleanIp || node.address;
  const targetPort = options.cleanPort || node.port;
  const targetHost = options.customSni || node.host;
  const targetSni = options.customSni || node.sni || node.host;

  const params = new URLSearchParams(node.params || '');
  if (targetHost) params.set('host', targetHost);
  if (targetSni) params.set('sni', targetSni);

  if (options.fragment && options.fragment.enabled) {
    params.set('fragment', `${options.fragment.length || '10-50'},${options.fragment.interval || '10-20'},${options.fragment.packets || 'tlshello'}`);
  }

  let name = node.name || 'VLESS-Node';
  if (options.prefix) name = `${options.prefix} ${name}`;

  return `vless://${node.auth}@${targetIp}:${targetPort}?${params.toString()}#${encodeURIComponent(name)}`;
}
