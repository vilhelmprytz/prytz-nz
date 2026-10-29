import { expect, test } from "vitest";
import { isAdminUser } from "./admin";

test("admin needs matching, verified email (case-insensitive)", () => {
  expect(isAdminUser({ email: "Vilhelm@PrytzNet.se", emailVerified: true }, "vilhelm@prytznet.se")).toBe(true);
  expect(isAdminUser({ email: "vilhelm@prytznet.se", emailVerified: false }, "vilhelm@prytznet.se")).toBe(false);
  expect(isAdminUser({ email: "mum@gmail.com", emailVerified: true }, "vilhelm@prytznet.se")).toBe(false);
  expect(isAdminUser(null, "vilhelm@prytznet.se")).toBe(false);
});
