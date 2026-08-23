export function toSingbox(nodes, exitProxy = null) {
  const outbounds = nodes.map(n => {
    if (n.protocol === 'vless') {
      return {
        type: 'vless',
        tag: n.name,
        server: n.address,
        server_port: parseInt(n.port, 10),
        uuid: n.auth,
        flow: n.flow || undefined,
        tls: {
          enabled: n.security === 'tls' || n.security === 'reality',
          server_name: n.sni || n.host,
          insecure: true,
          reality: n.security === 'reality' ? {
            enabled: true,
            public_key: n.pbk,
            short_id: n.sid
          } : undefined
        },
        transport: n.type === 'ws' ? {
          type: 'ws',
          path: n.path,
          headers: { Host: n.host }
        } : undefined
      };
    }
    if (n.protocol === 'trojan') {
      return {
        type: 'trojan',
        tag: n.name,
        server: n.address,
        server_port: parseInt(n.port, 10),
        password: n.auth,
        tls: {
          enabled: true,
          server_name: n.sni || n.host,
          insecure: true
        },
        transport: n.type === 'ws' ? {
          type: 'ws',
          path: n.path,
          headers: { Host: n.host }
        } : undefined
      };
    }
    return null;
  }).filter(Boolean);

  const nodeTags = outbounds.map(o => o.tag);

  // Real sing-box "urltest" outbound — picks the fastest working VLESS/
  // Trojan tunnel automatically. This is what the exit proxy below
  // tunnels through to reach the outside world.
  const autoOutbound = { type: 'urltest', tag: 'auto', outbounds: nodeTags, url: 'http://www.gstatic.com/generate_204', interval: '3m', tolerance: 50 };

  // Real exit-proxy outbound — the country HTTP/SOCKS proxy is the
  // FINAL hop your traffic actually exits from, reaching the outside
  // world itself via `detour: 'auto'` (tunneling through your best
  // working VLESS/Trojan node). Selecting this outbound means ALL
  // traffic exits from that proxy's IP, not just the VPN handshake.
  const exitOutbound = exitProxy ? {
    type: exitProxy.type, // 'http' | 'socks'
    tag: exitProxy.tag,
    server: exitProxy.server,
    server_port: exitProxy.port,
    username: exitProxy.username || undefined,
    password: exitProxy.password || undefined,
    version: exitProxy.type === 'socks' ? (exitProxy.socksVersion || '5') : undefined,
    detour: 'auto'
  } : null;

  // "Clean mode": when an exit proxy is set, the visible/selectable
  // 'select' menu shows ONLY the clean country entry + direct — the
  // real VLESS/Trojan node outbounds and the 'auto' group are still
  // fully defined in `outbounds` (required underneath for the chain to
  // function) but omitted from this list, so most sing-box clients
  // (which build their UI from the selector's member list) show just
  // one clean entry. Note: a few GUI clients render every top-level
  // outbound regardless of selector membership — this is a real
  // limitation outside this app's control, not something we can force
  // client-side.
  const selectOutbounds = exitOutbound ? [exitOutbound.tag, 'direct'] : ['auto', ...nodeTags, 'direct'];

  return JSON.stringify({
    log: { level: 'info', timestamp: true },
    dns: {
      servers: [
        { tag: 'google', address: 'tls://8.8.8.8' },
        { tag: 'local', address: '223.5.5.5', detour: 'direct' }
      ]
    },
    inbounds: [
      { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 2080 }
    ],
    outbounds: [
      {
        type: 'selector',
        tag: 'select',
        outbounds: selectOutbounds,
        default: exitOutbound ? exitOutbound.tag : 'auto'
      },
      autoOutbound,
      ...(exitOutbound ? [exitOutbound] : []),
      ...outbounds,
      { type: 'direct', tag: 'direct' },
      { type: 'block', tag: 'block' }
    ]
  }, null, 2);
}
