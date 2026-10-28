import { expect, test } from "vitest";
import { clientIp, rateLimitKey } from "./client-ip";

const h = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

test("takes the entry added by the outermost trusted proxy", () => {
  expect(clientIp(h("6.6.6.6, 198.51.100.1, 203.0.113.9"), 1)).toBe("203.0.113.9");
  expect(clientIp(h("6.6.6.6, 198.51.100.1, 203.0.113.9"), 2)).toBe("198.51.100.1");
});

test("fewer entries than hops → left-most", () => {
  expect(clientIp(h("203.0.113.9"), 3)).toBe("203.0.113.9");
});

test('no header → "unknown"', () => {
  expect(clientIp(h(), 1)).toBe("unknown");
});

test("unwraps IPv4-mapped IPv6", () => {
  expect(clientIp(h("::ffff:203.0.113.9"), 1)).toBe("203.0.113.9");
});

test("IPv6 keyed by /64", () => {
  expect(rateLimitKey("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
  expect(rateLimitKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  expect(rateLimitKey("203.0.113.9")).toBe("203.0.113.9");
});
