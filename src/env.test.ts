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

const smtp = { ...base, STORAGE_DRIVER: "fs", SMTP_HOST: "smtp.example.com", SMTP_FROM: "prytz.nz <noreply@prytz.nz>" };

test("SMTP is off by default, with defaults", () => {
  const env = parseEnv({ ...base, STORAGE_DRIVER: "fs" });
  expect(env.SMTP_HOST).toBeFalsy();
  expect(env.SMTP_PORT).toBe(587);
  expect(env.SMTP_SECURITY).toBe("starttls");
});

test("an empty SMTP_HOST counts as off and needs nothing else", () => {
  expect(parseEnv({ ...base, STORAGE_DRIVER: "fs", SMTP_HOST: "" }).SMTP_HOST).toBeFalsy();
});

test("SMTP_HOST without SMTP_FROM throws naming it", () => {
  expect(() => parseEnv({ ...smtp, SMTP_FROM: "" })).toThrow(/SMTP_FROM/);
});

test("SMTP_USER without SMTP_PASSWORD throws naming it", () => {
  expect(() => parseEnv({ ...smtp, SMTP_USER: "user" })).toThrow(/SMTP_PASSWORD/);
  expect(() => parseEnv({ ...smtp, SMTP_PASSWORD: "pw" })).toThrow(/SMTP_USER/);
});

test("unknown SMTP_SECURITY is rejected", () => {
  expect(() => parseEnv({ ...smtp, SMTP_SECURITY: "ssl" })).toThrow();
});

test("host, from and credentials parse", () => {
  const env = parseEnv({ ...smtp, SMTP_PORT: "465", SMTP_SECURITY: "tls", SMTP_USER: "user", SMTP_PASSWORD: "pw" });
  expect(env).toMatchObject({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: 465,
    SMTP_SECURITY: "tls",
    SMTP_USER: "user",
    SMTP_PASSWORD: "pw",
    SMTP_FROM: "prytz.nz <noreply@prytz.nz>",
  });
});
