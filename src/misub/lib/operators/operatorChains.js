export function deduplicateNodes(nodes) {
  const seen = new Set();
  const deduped = [];

  for (const node of nodes) {
    const key = `${node.protocol}://${node.auth}@${node.address}:${node.port}?${node.path || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(node);
    }
  }
  return deduped;
}

export function filterNodesByKeyword(nodes, keyword) {
  if (!keyword || !keyword.trim()) return nodes;
  const kw = keyword.toLowerCase().trim();
  return nodes.filter(n => 
    n.name.toLowerCase().includes(kw) ||
    n.address.toLowerCase().includes(kw) ||
    (n.sni && n.sni.toLowerCase().includes(kw)) ||
    String(n.port).includes(kw)
  );
}

export function sortNodes(nodes, sortMode = 'protocol') {
  const list = [...nodes];
  if (sortMode === 'protocol') {
    return list.sort((a, b) => a.protocol.localeCompare(b.protocol));
  }
  if (sortMode === 'name') {
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (sortMode === 'port') {
    return list.sort((a, b) => parseInt(a.port, 10) - parseInt(b.port, 10));
  }
  return list;
}
