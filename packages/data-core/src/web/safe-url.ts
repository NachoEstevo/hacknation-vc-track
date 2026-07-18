import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type AddressLookup = (hostname: string) => Promise<string[]>;

function blockedIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b, c] = octets;
  if (a === undefined || b === undefined || c === undefined) return true;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && ((b === 0 && c === 0) || b === 168)) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113);
}

function blockedAddress(address: string): boolean {
  if (isIP(address) === 4) return blockedIpv4(address);
  if (isIP(address) !== 6) return true;
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") || normalized.startsWith("fea") ||
    normalized.startsWith("feb") || normalized.startsWith("ff");
}

async function defaultLookup(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map(({ address }) => address);
}

export async function assertSafePublicUrl(
  url: URL,
  lookup: AddressLookup = defaultLookup,
): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs are allowed");
  }
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("Target must resolve to the public internet");
  }
  const addresses = await lookup(url.hostname);
  if (!addresses.length || addresses.some(blockedAddress)) {
    throw new Error("Target must resolve only to the public internet");
  }
}
