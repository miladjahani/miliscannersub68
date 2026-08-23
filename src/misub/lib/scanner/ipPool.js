// Official, current Cloudflare IPv4 CIDR ranges — identical to the list
// published by Cloudflare and used by the real Cloudflare-Clean-IP-Scanner
// (ip.txt) reference tool this app is built around.
export const CLOUDFLARE_CIDRS = [
  { cidr: '173.245.48.0/20', base: [173, 245, 48, 0], mask: 20 },
  { cidr: '103.21.244.0/22', base: [103, 21, 244, 0], mask: 22 },
  { cidr: '103.22.200.0/22', base: [103, 22, 200, 0], mask: 22 },
  { cidr: '103.31.4.0/22', base: [103, 31, 4, 0], mask: 22 },
  { cidr: '141.101.64.0/18', base: [141, 101, 64, 0], mask: 18 },
  { cidr: '108.162.192.0/18', base: [108, 162, 192, 0], mask: 18 },
  { cidr: '190.93.240.0/20', base: [190, 93, 240, 0], mask: 20 },
  { cidr: '188.114.96.0/20', base: [188, 114, 96, 0], mask: 20 },
  { cidr: '197.234.240.0/22', base: [197, 234, 240, 0], mask: 22 },
  { cidr: '198.41.128.0/17', base: [198, 41, 128, 0], mask: 17 },
  { cidr: '162.158.0.0/15', base: [162, 158, 0, 0], mask: 15 },
  { cidr: '104.16.0.0/13', base: [104, 16, 0, 0], mask: 13 },
  { cidr: '104.24.0.0/14', base: [104, 24, 0, 0], mask: 14 },
  { cidr: '172.64.0.0/13', base: [172, 64, 0, 0], mask: 13 },
  { cidr: '131.0.72.0/22', base: [131, 0, 72, 0], mask: 22 }
];

function octetsToInt(o) {
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}
function intToOctets(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

/**
 * Picks a genuinely random, in-range address inside a CIDR block using
 * correct bitwise host-range math (not a naive octet increment), so
 * every address returned is truly a valid member of that /mask block —
 * mirroring the real scanner tool's default "one random host per range"
 * sampling behavior (a full /24 sweep is available via `-allip` in the
 * reference CLI; this app samples broadly across every published range
 * instead).
 */
function randomIpInCidr({ base, mask }) {
  const hostBits = 32 - mask;
  const baseInt = octetsToInt(base);
  const maxHostVal = hostBits >= 31 ? 0xFFFFFFFF : (Math.pow(2, hostBits) - 1);
  // Avoid picking the network (.0) or broadcast address when the block is large enough to matter.
  const randomHost = hostBits > 1
    ? 1 + Math.floor(Math.random() * (maxHostVal - 1))
    : Math.floor(Math.random() * (maxHostVal + 1));
  const ipInt = (baseInt + randomHost) >>> 0;
  return intToOctets(ipInt).join('.');
}

export function generateRandomCloudflareIps(count = 1000) {
  const ips = new Set();
  let guard = 0;
  // Weight selection by range size (larger CIDR blocks contribute
  // proportionally more candidates) rather than uniform per-CIDR, which
  // better mirrors the real distribution of Cloudflare's address space.
  const weighted = CLOUDFLARE_CIDRS.map(item => ({ item, weight: Math.pow(2, 32 - item.mask) }));
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);

  function pickWeightedCidr() {
    let r = Math.random() * totalWeight;
    for (const w of weighted) {
      if (r < w.weight) return w.item;
      r -= w.weight;
    }
    return weighted[weighted.length - 1].item;
  }

  while (ips.size < count && guard < count * 5) {
    guard++;
    const item = pickWeightedCidr();
    ips.add(randomIpInCidr(item));
  }

  return Array.from(ips);
}
