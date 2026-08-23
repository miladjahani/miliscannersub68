import { decodeBase64, encodeBase64 } from './base64';
import { parseVless, buildVless } from './vless';
import { parseVmess, buildVmess } from './vmess';
import { parseTrojan, buildTrojan } from './trojan';
import { parseShadowsocks, buildShadowsocks } from './shadowsocks';
import { parseHysteria, buildHysteria } from './hysteria';
import { parseTuic, buildTuic } from './tuic';
import { parseClashYamlNodes } from './clashParser';
import { parseSingboxJsonNodes } from './singboxParser';

export { decodeBase64, encodeBase64, parseClashYamlNodes, parseSingboxJsonNodes };

export function parseNode(uri) {
  if (!uri || typeof uri !== 'string') return null;
  uri = uri.trim();
  if (!uri.includes('://')) return null;

  const [proto] = uri.split('://');
  const p = proto.toLowerCase();

  try {
    if (p === 'vless') return parseVless(uri);
    if (p === 'vmess') return parseVmess(uri);
    if (p === 'trojan') return parseTrojan(uri);
    if (p === 'ss') return parseShadowsocks(uri);
    if (p === 'hysteria2' || p === 'hy2' || p === 'hysteria') return parseHysteria(uri);
    if (p === 'tuic') return parseTuic(uri);
  } catch (err) {
    console.error('Failed to parse protocol:', p, err);
  }

  return {
    id: 'unknown_' + Math.random().toString(36).substr(2, 9),
    protocol: p,
    raw: uri,
    name: `Node-${p}`,
    address: 'unknown',
    port: 0
  };
}

export function buildOptimizedNode(node, options = {}) {
  if (!node) return '';
  const p = node.protocol;

  if (p === 'vless') return buildVless(node, options);
  if (p === 'vmess') return buildVmess(node, options);
  if (p === 'trojan') return buildTrojan(node, options);
  if (p === 'ss') return buildShadowsocks(node, options);
  if (p === 'hysteria2' || p === 'hy2' || p === 'hysteria') return buildHysteria(node, options);
  if (p === 'tuic') return buildTuic(node, options);

  return node.raw || '';
}

export function parseMultipleNodes(content) {
  if (!content || typeof content !== 'string') return [];
  let text = content.trim();
  if (!text) return [];

  // 1. Clash YAML Detection
  if (text.includes('proxies:')) {
    const yamlNodes = parseClashYamlNodes(text);
    if (yamlNodes.length > 0) return yamlNodes;
  }

  // 2. Sing-box JSON Detection
  if (text.startsWith('{') || text.startsWith('[')) {
    const jsonNodes = parseSingboxJsonNodes(text);
    if (jsonNodes.length > 0) return jsonNodes;
  }

  // 3. Base64 Multi-line or Blob Detection
  if (!text.includes('://') && text.length > 20) {
    const decoded = decodeBase64(text);
    if (decoded && decoded !== text) {
      return parseMultipleNodes(decoded);
    }
  }

  // 4. Line-by-line parsing (extracts all protocol lines, even from mixed logs or text)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];

  for (const line of lines) {
    if (line.includes('://')) {
      const node = parseNode(line);
      if (node) results.push(node);
    } else if (line.length > 20) {
      // Possible single line base64
      const decodedLine = decodeBase64(line);
      if (decodedLine.includes('://')) {
        const node = parseNode(decodedLine);
        if (node) results.push(node);
      }
    }
  }

  return results;
}
