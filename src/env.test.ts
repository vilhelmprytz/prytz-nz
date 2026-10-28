import { expect, test } from "vitest";
import { parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://x",
  FAMILY_PASSWORD: "pw",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "s",
  ADMIN_EMAIL: "a@b.se",
};

test("fs driver needs no S3 vars and applies defaults", () => {
  const env = parseEnv({ ...base, STORAGE_DRIVER: "fs" });
  expect(env.TRUSTED_PROXY_HOPS).toBe(1);
  expect(env.FS_STORAGE_DIR).toBe(".storage");
  expect(env.E2E_TEST_AUTH).toBe(false);
});

test("s3 driver without S3 vars throws naming the missing var", () => {
  expect(() => parseEnv({ ...base })).toThrow(/S3_BUCKET/);
});

test("short auth secret is rejected", () => {
  expect(() => parseEnv({ ...base, STORAGE_DRIVER: "fs", BETTER_AUTH_SECRET: "short" })).toThrow();
});
