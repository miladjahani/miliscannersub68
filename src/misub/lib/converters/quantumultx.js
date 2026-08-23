export function toQuantumultX(nodes) {
  const lines = nodes.map(n => {
    if (n.protocol === 'vless' || n.protocol === 'trojan') {
      return `trojan=${n.address}:${n.port}, password=${n.auth}, over-tls=true, tls-host=${n.sni || n.host}, tag=${n.name}`;
    }
    if (n.protocol === 'vmess') {
      return `vmess=${n.address}:${n.port}, method=auto, password=${n.auth}, obfs=${n.type}, obfs-host=${n.host}, obfs-uri=${n.path}, tag=${n.name}`;
    }
    return null;
  }).filter(Boolean);

  return `[server_local]\n${lines.join('\n')}\n`;
}
