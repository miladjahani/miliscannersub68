import { decodeBase64, encodeBase64 } from './base64';

export function parseVmess(uri) {
  const b64 = uri.replace('vmess://', '');
  const jsonStr = decodeBase64(b64);
  const json = JSON.parse(jsonStr);

  return {
    id: 'vmess_' + Math.random().toString(36).substr(2, 9),
    protocol: 'vmess',
    raw: uri,
    name: json.ps || `VMess-${json.add}:${json.port}`,
    auth: json.id,
    address: json.add,
    port: json.port || 443,
    host: json.host || json.add,
    sni: json.sni || json.host || json.add,
    path: json.path || '/',
    type: json.net || 'ws',
    security: json.tls || 'none',
    aid: json.aid || 0,
    scy: json.scy || 'auto',
    vmessObj: json
  };
}

export function buildVmess(node, options = {}) {
  const targetIp = options.cleanIp || node.address;
  const targetPort = options.cleanPort || node.port;
  const targetHost = options.customSni || node.host;
  const targetSni = options.customSni || node.sni || node.host;

  const obj = { ...(node.vmessObj || {}) };
  obj.add = targetIp;
  obj.port = parseInt(targetPort, 10);
  if (targetHost) obj.host = targetHost;
  if (targetSni) obj.sni = targetSni;
  if (options.prefix) obj.ps = `${options.prefix} ${obj.ps || node.name}`;

  return `vmess://${encodeBase64(JSON.stringify(obj))}`;
}
