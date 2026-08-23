export function toLoon(nodes) {
  const lines = nodes.map(n => {
    if (n.protocol === 'trojan') {
      return `${n.name} = trojan, ${n.address}, ${n.port}, "${n.auth}", over-tls=true, tls-name=${n.sni || n.host}`;
    }
    return null;
  }).filter(Boolean);

  return `[Proxy]\n${lines.join('\n')}\n`;
}
