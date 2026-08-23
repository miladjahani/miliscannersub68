export function toSurge(nodes) {
  const lines = nodes.map(n => {
    if (n.protocol === 'trojan') {
      return `${n.name} = trojan, ${n.address}, ${n.port}, password=${n.auth}, sni=${n.sni || n.host}, skip-cert-verify=true`;
    }
    if (n.protocol === 'vmess') {
      return `${n.name} = vmess, ${n.address}, ${n.port}, username=${n.auth}, ws=true, ws-path=${n.path}, ws-headers=Host:${n.host}`;
    }
    return null;
  }).filter(Boolean);

  return `[Proxy]\n${lines.join('\n')}\n`;
}
