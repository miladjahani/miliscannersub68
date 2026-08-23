import { toClashMeta } from './clash';
import { toSingbox } from './singbox';
import { toQuantumultX } from './quantumultx';
import { toSurge } from './surge';
import { toLoon } from './loon';
import { encodeBase64 } from '../protocols/base64';

export function convertNodesToClient(nodes, format = 'base64') {
  if (!nodes || !nodes.length) return '';

  switch (format) {
    case 'clash':
      return toClashMeta(nodes);
    case 'singbox':
      return toSingbox(nodes);
    case 'quantumultx':
      return toQuantumultX(nodes);
    case 'surge':
      return toSurge(nodes);
    case 'loon':
      return toLoon(nodes);
    case 'base64':
    default: {
      const raws = nodes.map(n => n.raw || '').join('\n');
      return encodeBase64(raws);
    }
  }
}
