import dns from "node:dns/promises";
import net from "node:net";

export interface UrlSafetyOptions {
  requireHttps?: boolean;
}

const blockedHostnames = new Set([
  "localhost",
  "localhost.",
  "host.docker.internal",
  "metadata.google.internal",
  "metadata.google.internal.",
]);

const blockedIpRanges = new net.BlockList();

blockedIpRanges.addSubnet("0.0.0.0", 8, "ipv4");
blockedIpRanges.addSubnet("10.0.0.0", 8, "ipv4");
blockedIpRanges.addSubnet("100.64.0.0", 10, "ipv4");
blockedIpRanges.addSubnet("127.0.0.0", 8, "ipv4");
blockedIpRanges.addSubnet("169.254.0.0", 16, "ipv4");
blockedIpRanges.addSubnet("172.16.0.0", 12, "ipv4");
blockedIpRanges.addSubnet("192.168.0.0", 16, "ipv4");
blockedIpRanges.addSubnet("198.18.0.0", 15, "ipv4");
blockedIpRanges.addSubnet("224.0.0.0", 4, "ipv4");
blockedIpRanges.addSubnet("240.0.0.0", 4, "ipv4");

blockedIpRanges.addSubnet("::", 128, "ipv6");
blockedIpRanges.addSubnet("::1", 128, "ipv6");
blockedIpRanges.addSubnet("fc00::", 7, "ipv6");
blockedIpRanges.addSubnet("fe80::", 10, "ipv6");
blockedIpRanges.addSubnet("ff00::", 8, "ipv6");

function parseExternalUrl(
  url: string,
  { requireHttps = false }: UrlSafetyOptions = {},
): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (requireHttps) {
    if (parsed.protocol !== "https:") return null;
  } else if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (!parsed.hostname) return null;
  return parsed;
}

function isPublicIpAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return false;

  return !blockedIpRanges.check(address, family === 6 ? "ipv6" : "ipv4");
}

export function isSafePublicUrl(
  url: string,
  options: UrlSafetyOptions = {},
): boolean {
  const parsed = parseExternalUrl(url, options);
  if (!parsed) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (blockedHostnames.has(hostname)) return false;

  const family = net.isIP(hostname);
  if (family !== 0) return isPublicIpAddress(hostname);

  return true;
}

export async function isSafePublicFetchUrl(
  url: string,
  options: UrlSafetyOptions = {},
): Promise<boolean> {
  const parsed = parseExternalUrl(url, options);
  if (!parsed) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (blockedHostnames.has(hostname)) return false;

  const family = net.isIP(hostname);
  if (family !== 0) return isPublicIpAddress(hostname);

  let resolved: Array<{ address: string }>;
  try {
    resolved = (await dns.lookup(hostname, {
      all: true,
      verbatim: true,
    })) as Array<{
      address: string;
    }>;
  } catch {
    return false;
  }

  return (
    resolved.length > 0 &&
    resolved.every(({ address }) => isPublicIpAddress(address))
  );
}
