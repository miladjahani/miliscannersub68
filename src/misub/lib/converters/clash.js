export function toClashMeta(nodes, groupName = 'PROXIES', exitProxy = null) {
  const proxies = nodes.map(n => {
    if (n.protocol === 'vless') {
      return {
        name: n.name,
        type: 'vless',
        server: n.address,
        port: parseInt(n.port, 10),
        uuid: n.auth,
        udp: true,
        tls: n.security === 'tls' || n.security === 'reality',
        servername: n.sni || n.host,
        'reality-opts': n.security === 'reality' ? { 'public-key': n.pbk, 'short-id': n.sid } : undefined,
        'client-fingerprint': n.fp || 'chrome',
        network: n.type || 'ws',
        'ws-opts': n.type === 'ws' ? { path: n.path, headers: { Host: n.host } } : undefined,
        'grpc-opts': n.type === 'grpc' ? { 'grpc-service-name': n.path } : undefined
      };
    }
    if (n.protocol === 'trojan') {
      return {
        name: n.name,
        type: 'trojan',
        server: n.address,
        port: parseInt(n.port, 10),
        password: n.auth,
        udp: true,
        sni: n.sni || n.host,
        network: n.type || 'ws',
        'ws-opts': n.type === 'ws' ? { path: n.path, headers: { Host: n.host } } : undefined
      };
    }
    if (n.protocol === 'vmess') {
      return {
        name: n.name,
        type: 'vmess',
        server: n.address,
        port: parseInt(n.port, 10),
        uuid: n.auth,
        alterId: n.aid || 0,
        cipher: 'auto',
        udp: true,
        tls: n.security === 'tls',
        servername: n.sni || n.host,
        network: n.type || 'ws',
        'ws-opts': n.type === 'ws' ? { path: n.path, headers: { Host: n.host } } : undefined
      };
    }
    if (n.protocol === 'hysteria2') {
      return {
        name: n.name,
        type: 'hysteria2',
        server: n.address,
        port: parseInt(n.port, 10),
        password: n.auth,
        sni: n.sni || n.address,
        'skip-cert-verify': true
      };
    }
    return null;
  }).filter(Boolean);

  const proxyNames = proxies.map(p => p.name);

  // Real Clash Meta "exit proxy" chain — the correct direction: the
  // country HTTP/SOCKS proxy is the FINAL hop that all your internet
  // traffic actually exits from, and it reaches the outside world by
  // tunneling its own connection through your VLESS/Trojan nodes
  // (via 'dialer-proxy' pointing at the AUTO url-test group). Selecting
  // this proxy as your active outbound means ALL traffic exits from
  // that proxy's IP/country, not just the handshake to reach the node.
  let exitProxyEntry = null;
  if (exitProxy) {
    exitProxyEntry = {
      name: exitProxy.name,
      type: exitProxy.type, // 'http' | 'socks5'
      server: exitProxy.server,
      port: exitProxy.port,
      username: exitProxy.username || undefined,
      password: exitProxy.password || undefined,
      'dialer-proxy': 'AUTO'
    };

    // "Clean mode": when an exit proxy is set, the individual VLESS/
    // Trojan nodes are marked with Clash Meta's real `hidden: true`
    // field — they keep working as the AUTO group's dialer target, but
    // no longer clutter the visible proxy list. The end result in your
    // client is a single, clean entry (the country flag/name), which
    // feels like a direct injection even though a real protocol-level
    // hop still happens underneath (unavoidable — see note below).
    proxies.forEach(p => { p.hidden = true; });
  }

  const allProxies = exitProxyEntry ? [...proxies, exitProxyEntry] : proxies;

  // Without an exit proxy: show every node normally, as before.
  // With an exit proxy: the visible selectable list is reduced to just
  // the clean country entry + DIRECT — the real underlying VLESS/Trojan
  // nodes are still present (required for the chain to function) but
  // hidden from this list via the `hidden` flag above.
  const selectableNames = exitProxyEntry ? [exitProxyEntry.name] : proxyNames;

  return `port: 7890
socks-port: 7891
allow-lan: true
mode: rule
log-level: info
ipv6: false
external-controller: 127.0.0.1:9090
proxies:
${JSON.stringify(allProxies, null, 2)}
proxy-groups:
  - name: ${groupName}
    type: select
    proxies:
${selectableNames.map(p => `      - "${p}"`).join('\n')}
      - DIRECT
  - name: AUTO
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    proxies:
${proxyNames.map(p => `      - "${p}"`).join('\n')}
rules:
  - MATCH,${groupName}
`;
}
