import { expect, test } from "vitest";
import { classifyPath, isAdminPagePath, safeNextPath } from "./paths";

test.each([
  ["/unlock", "public"],
  ["/api/auth/callback/google", "public"],
  ["/robots.txt", "public"],
  ["/admin", "self-guarded"],
  ["/admin/posts/1", "self-guarded"],
  ["/api/admin/uploads", "self-guarded"],
  ["/api/dev-storage/photos/x", "self-guarded"],
  ["/", "reader"],
  ["/photos/x/display", "reader"],
  ["/api/feed", "reader"],
  ["/administrator", "reader"],
  ["/unlockx", "reader"],
])("%s → %s", (p, c) => {
  expect(classifyPath(p)).toBe(c);
});

test.each([
  [null, "/"],
  ["/?post=1", "/?post=1"],
  ["//evil.com", "/"],
  ["https://evil.com", "/"],
  ["/\\evil.com", "/"],
])("safeNextPath(%s) → %s", (n, out) => {
  expect(safeNextPath(n)).toBe(out);
});

test.each([
  ["/admin", true],
  ["/admin/posts/1", true],
  ["/admin/login", false],
  ["/admin/loginx", true],
  ["/api/admin/uploads", false],
  ["/administrator", false],
])("isAdminPagePath(%s) → %s", (p, expected) => {
  expect(isAdminPagePath(p)).toBe(expected);
});
