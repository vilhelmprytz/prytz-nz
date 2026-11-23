import { expect, test, vi } from "vitest";
import { parseEnv } from "@/env";
import { checkSmtp, createMailer, smtpOptions, type Mailer } from "./smtp";

const base = {
  DATABASE_URL: "postgres://x",
  FAMILY_PASSWORD: "pw",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "s",
  ADMIN_EMAIL: "a@b.se",
  STORAGE_DRIVER: "fs",
};
const withSmtp = (extra: Record<string, string> = {}) =>
  parseEnv({ ...base, SMTP_HOST: "smtp.example.com", SMTP_FROM: "prytz.nz <noreply@prytz.nz>", ...extra });

test.each([
  ["starttls", { secure: false, requireTLS: true, ignoreTLS: false }],
  ["tls", { secure: true, requireTLS: false, ignoreTLS: false }],
  ["none", { secure: false, requireTLS: false, ignoreTLS: true }],
])("security %s", (security, expected) => {
  expect(smtpOptions(withSmtp({ SMTP_SECURITY: security }))).toMatchObject({
    host: "smtp.example.com",
    port: 587,
    ...expected,
  });
});

test("credentials become auth", () => {
  expect(smtpOptions(withSmtp({ SMTP_USER: "user", SMTP_PASSWORD: "pw" })).auth).toEqual({ user: "user", pass: "pw" });
});

test("no credentials → no auth; timeouts always set", () => {
  const options = smtpOptions(withSmtp());
  expect(options.auth).toBeUndefined();
  expect(options).toMatchObject({ connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 });
});

test("createMailer without SMTP_HOST → null", () => {
  expect(createMailer(parseEnv(base))).toBeNull();
  expect(createMailer(withSmtp())).not.toBeNull();
});

function fakeMailer(verify: () => Promise<void>) {
  const close = vi.fn();
  const mailer: Mailer = { send: vi.fn(), verify, close };
  return { mailer, close };
}

test("checkSmtp does nothing without a mailer", async () => {
  const log = { info: vi.fn(), error: vi.fn() };
  await checkSmtp(null, log);
  expect(log.info).not.toHaveBeenCalled();
  expect(log.error).not.toHaveBeenCalled();
});

test("checkSmtp logs ok and closes", async () => {
  const { mailer, close } = fakeMailer(async () => {});
  const log = { info: vi.fn(), error: vi.fn() };
  await checkSmtp(mailer, log);
  expect(log.info).toHaveBeenCalledWith("[smtp] ok");
  expect(log.error).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});

test("checkSmtp logs a failure, closes, and doesn't throw", async () => {
  const failure = new Error("535 Authentication failed");
  const { mailer, close } = fakeMailer(async () => {
    throw failure;
  });
  const log = { info: vi.fn(), error: vi.fn() };
  await expect(checkSmtp(mailer, log)).resolves.toBeUndefined();
  expect(log.error).toHaveBeenCalledWith("[smtp] check failed", failure);
  expect(close).toHaveBeenCalledTimes(1);
});
