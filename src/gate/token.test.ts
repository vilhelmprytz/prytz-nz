import { expect, test } from "vitest";
import { createGateToken, verifyGateToken } from "./token";

const S = "s".repeat(32);
const T0 = Date.UTC(2026, 9, 27);

test("round trip", () => {
  expect(verifyGateToken(createGateToken(T0, "pw", S), T0 + 1000, "pw", S)).toBe(true);
});

test("password change invalidates", () => {
  expect(verifyGateToken(createGateToken(T0, "pw", S), T0, "new", S)).toBe(false);
});

test("expires after 180 days", () => {
  expect(verifyGateToken(createGateToken(T0, "pw", S), T0 + 181 * 864e5, "pw", S)).toBe(false);
});

test.each(["", "v1", "v1.abc.def", "v2.1.x", createGateToken(T0, "pw", S) + "x"])("rejects %s", (t) => {
  expect(verifyGateToken(t, T0, "pw", S)).toBe(false);
});

test("rejects undefined", () => {
  expect(verifyGateToken(undefined, T0, "pw", S)).toBe(false);
});

test("rejects issuedAt far in the future", () => {
  expect(verifyGateToken(createGateToken(T0 + 120_000, "pw", S), T0, "pw", S)).toBe(false);
});
