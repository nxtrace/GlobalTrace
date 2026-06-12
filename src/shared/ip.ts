export function isPublicIp(ip: string): boolean {
  if (ip.includes(":")) {
    return isPublicIpv6(ip);
  }

  return isPublicIpv4(ip);
}

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 88 && parts[2] === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && parts[2] === 100) return false;
  if (a === 203 && b === 0 && parts[2] === 113) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(ip: string): boolean {
  const hextets = expandIpv6(ip.toLowerCase().split("%")[0]);
  if (!hextets) return false;

  const mappedIpv4 = ipv4FromMappedIpv6(hextets);
  if (mappedIpv4) return isPublicIpv4(mappedIpv4);

  if (hextets.every((hextet) => hextet === 0)) return false;
  if (hextets.slice(0, 7).every((hextet) => hextet === 0) && hextets[7] === 1) return false;

  const first = hextets[0];
  if ((first & 0xff00) === 0xff00) return false;
  if ((first & 0xfe00) === 0xfc00) return false;
  if ((first & 0xffc0) === 0xfe80) return false;
  if ((first & 0xffc0) === 0xfec0) return false;
  if (first === 0x2001 && hextets[1] === 0x0db8) return false;
  return true;
}

function expandIpv6(ip: string): number[] | null {
  if (!ip || ip.split("::").length > 2) return null;

  const hasCompression = ip.includes("::");
  const [head = "", tail = ""] = ip.split("::");
  const headParts = parseIpv6Parts(head);
  const tailParts = parseIpv6Parts(tail);
  if (!headParts || !tailParts) return null;

  if (!hasCompression) {
    return headParts.length === 8 ? headParts : null;
  }

  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 1) return null;
  return [...headParts, ...Array.from({ length: missing }, () => 0), ...tailParts];
}

function parseIpv6Parts(value: string): number[] | null {
  if (!value) return [];
  const parts = value.split(":");
  const out: number[] = [];

  for (const part of parts) {
    if (!part) return null;
    if (part.includes(".")) {
      const embedded = ipv4ToHextets(part);
      if (!embedded) return null;
      out.push(...embedded);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    out.push(parseInt(part, 16));
  }

  return out.length <= 8 ? out : null;
}

function ipv4ToHextets(ip: string): [number, number] | null {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return [(parts[0] << 8) + parts[1], (parts[2] << 8) + parts[3]];
}

function ipv4FromMappedIpv6(hextets: number[]): string | null {
  const mapped = hextets.slice(0, 5).every((hextet) => hextet === 0) && hextets[5] === 0xffff;
  if (!mapped) return null;
  return [
    hextets[6] >> 8,
    hextets[6] & 0xff,
    hextets[7] >> 8,
    hextets[7] & 0xff,
  ].join(".");
}
