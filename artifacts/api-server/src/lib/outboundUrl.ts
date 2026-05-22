import { lookup } from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const n = ip.toLowerCase();
    if (n === "::1") return true;
    if (n.startsWith("fe80:")) return true;
    if (n.startsWith("fc") || n.startsWith("fd")) return true;
    if (n.startsWith("::ffff:")) {
      const v4 = n.slice("::ffff:".length);
      if (net.isIPv4(v4)) return isPrivateIp(v4);
    }
  }
  return false;
}

/** Restrict outbound fetches (IdP metadata, etc.) to public HTTPS targets. */
export async function assertSafeOutboundHttpsUrl(urlString: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Only https URLs are allowed");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error("Hostname is not allowed");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("IP address is not allowed");
    return url;
  }
  const records = await lookup(host, { all: true });
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new Error("Hostname resolves to a private address");
    }
  }
  return url;
}
