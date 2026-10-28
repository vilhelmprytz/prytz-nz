/**
 * The visitor's IP as seen by the outermost trusted proxy. Each trusted proxy (Traefik on Dokploy)
 * appends the address it received the request from, so the entry `trustedHops` from the right is
 * the first one a client could not have forged.
 */
export function clientIp(headers: Headers, trustedHops: number): string {
  if (trustedHops < 1) return "unknown";
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length === 0) return "unknown";
  return normalizeIp(entries[Math.max(0, entries.length - trustedHops)]);
}

function normalizeIp(ip: string): string {
  const lower = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  return mapped ? mapped[1] : lower;
}

/** IPv6 visitors get a whole /64, so one home network can't dodge the limit by rotating addresses. */
export function rateLimitKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail === undefined ? [] : tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (tail === undefined ? headGroups.length !== 8 : missing < 0) return ip;
  const groups = [...headGroups, ...Array<string>(Math.max(0, missing)).fill("0"), ...tailGroups];
  const prefix = groups.slice(0, 4).map((g) => parseInt(g, 16));
  if (prefix.some(Number.isNaN)) return ip;
  return `${prefix.map((n) => n.toString(16)).join(":")}::/64`;
}
