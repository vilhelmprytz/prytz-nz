import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const GATE_COOKIE = "pz_gate";
export const GATE_MAX_AGE_S = 180 * 24 * 3600;
const FUTURE_SKEW_MS = 60_000;

// The signature covers a hash of the password, so changing FAMILY_PASSWORD invalidates every cookie.
function sign(issuedAt: string, password: string, secret: string): string {
  const passwordHash = createHash("sha256").update(password).digest("hex");
  return createHmac("sha256", secret).update(`gate:${issuedAt}:${passwordHash}`).digest("base64url");
}

export function createGateToken(nowMs: number, password: string, secret: string): string {
  const issuedAt = String(Math.floor(nowMs));
  return `v1.${issuedAt}.${sign(issuedAt, password, secret)}`;
}

export function verifyGateToken(token: string | undefined, nowMs: number, password: string, secret: string): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) return false;
  const [, issuedAt, signature] = parts;
  const issuedMs = Number(issuedAt);
  if (issuedMs > nowMs + FUTURE_SKEW_MS || nowMs - issuedMs > GATE_MAX_AGE_S * 1000) return false;
  const expected = Buffer.from(sign(issuedAt, password, secret));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
