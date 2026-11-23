import { afterEach, expect, test, vi } from "vitest";

const checkSmtp = vi.fn((): Promise<void> => new Promise(() => {})); // an SMTP server that never answers

vi.mock("./db/migrate", () => ({ runMigrations: async () => {} }));
vi.mock("./db/client", () => ({ getDb: () => ({}) }));
vi.mock("./storage/storage", () => ({ getStorage: () => ({}) }));
vi.mock("./posts/repo", () => ({ cleanupStalePhotos: async () => 0 }));
vi.mock("./env", () => ({ getEnv: () => ({}) }));
vi.mock("./notify/smtp", () => ({ createMailer: () => ({}), checkSmtp }));

const runtime = process.env.NEXT_RUNTIME;
afterEach(() => {
  process.env.NEXT_RUNTIME = runtime;
});

test("a slow SMTP server doesn't hold up the site's start", async () => {
  process.env.NEXT_RUNTIME = "nodejs";
  const { register } = await import("./instrumentation");
  const outcome = await Promise.race([
    register().then(() => "started"),
    new Promise((resolve) => setTimeout(() => resolve("blocked"), 500)),
  ]);
  expect(outcome).toBe("started");
  expect(checkSmtp).toHaveBeenCalledTimes(1);
});
