import { decodeBase64, encodeBase64 } from './base64';

export function parseShadowsocks(uri) {
  const parts = uri.replace('ss://', '').split('#');
  const hash = parts[1] ? decodeURIComponent(parts[1]) : '';
  let mainPart = parts[0];

  let userInfo = '';
  let hostPort = '';

  if (mainPart.includes('@')) {
    const atSplit = mainPart.split('@');
    userInfo = decodeBase64(atSplit[0]);
    hostPort = atSplit[1];
  } else {
    const decoded = decodeBase64(mainPart);
    const atSplit = decoded.split('@');
    userInfo = atSplit[0];
    hostPort = atSplit[1];
  }

  const [address, port] = (hostPort || '').split(':');
  return {
    id: 'ss_' + Math.random().toString(36).substr(2, 9),
    protocol: 'ss',
    raw: uri,
    name: hash || `SS-${address}:${port}`,
    auth: userInfo,
    address,
    port: port || 8388,
    type: 'tcp'
  };
}

export function buildShadowsocks(node, options = {}) {
  const targetIp = options.cleanIp || node.address;
  const targetPort = options.cleanPort || node.port;
  let name = node.name || 'SS-Node';
  if (options.prefix) name = `${options.prefix} ${name}`;

  const baseAuth = encodeBase64(node.auth);
  return `ss://${baseAuth}@${targetIp}:${targetPort}#${encodeURIComponent(name)}`;
}
