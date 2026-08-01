import dns from "dns/promises";
import net from "net";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 15000;

// Swappable so tests can exercise the guard without touching the network.
export const resolver = {
  lookup: (hostname) => dns.lookup(hostname, { all: true }),
};

// The API runs inside a Docker network alongside the database, and in production
// alongside the reverse proxy, so a server-side fetch can reach hosts no client
// can. These are the ranges that would let a user borrow the server's position:
// loopback, link-local (which includes cloud metadata at 169.254.169.254), and
// the private/CGNAT ranges.
function isBlockedAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase();
    if (value === "::" || value === "::1") return true;
    // Link-local (fe80::/10) and unique-local (fc00::/7).
    if (value.startsWith("fe80") || value.startsWith("fc") || value.startsWith("fd")) return true;
    // IPv4-mapped addresses (::ffff:0:0/96) tunnel an IPv4 target through IPv6.
    // WHATWG URL parsing rewrites the dotted form to hextets, so ::ffff:10.0.0.1
    // arrives here as ::ffff:a00:1 and both spellings have to be recognised.
    const dotted = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isBlockedAddress(dotted[1]);

    const hextets = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hextets) {
      const high = parseInt(hextets[1], 16);
      const low = parseInt(hextets[2], 16);
      return isBlockedAddress([high >> 8, high & 0xff, low >> 8, low & 0xff].join("."));
    }

    return false;
  }

  return true;
}

// Validates where a request would actually land rather than what it's called: a
// hostname an attacker controls can resolve to an internal address, so names are
// resolved and every returned address is checked.
export async function assertPublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme "${parsed.protocol}"`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) throw new Error("Invalid URL");

  let addresses;
  if (net.isIP(hostname)) {
    addresses = [hostname];
  } else {
    let resolved;
    try {
      resolved = await resolver.lookup(hostname);
    } catch {
      throw new Error(`Could not resolve host "${hostname}"`);
    }
    addresses = (Array.isArray(resolved) ? resolved : [resolved]).map((entry) => entry.address);
  }

  if (!addresses.length) throw new Error(`Could not resolve host "${hostname}"`);

  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new Error(`Refusing to fetch private or reserved address (${hostname} → ${address})`);
    }
  }

  return parsed;
}

// Redirects are followed manually so each hop is validated. A public URL that
// 302s to 169.254.169.254 would sail straight past a single up-front check.
export async function safeFetch(url, options = {}) {
  const fetchOptions = {
    ...options,
    redirect: "manual",
    signal: options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  };

  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const response = await fetch(current, fetchOptions);

    const location =
      response.status >= 300 && response.status < 400 && response.headers.get?.("location");
    if (!location) return response;

    current = new URL(location, current).toString();
  }

  throw new Error(`Too many redirects (limit ${MAX_REDIRECTS})`);
}
