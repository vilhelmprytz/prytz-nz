import { expect, test as setup } from "@playwright/test";
import postgres from "postgres";
import { ADMIN_STATE, E2E_BASE_URL, E2E_ENV, READER_STATE } from "./env";

setup("admin session", async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: E2E_BASE_URL, extraHTTPHeaders: { origin: E2E_BASE_URL } });
  const res = await api.post("/api/auth/sign-up/email", {
    data: { email: E2E_ENV.ADMIN_EMAIL, password: "admin-password-123", name: "Vilhelm Prytz" },
  });
  expect(res.ok()).toBeTruthy();
  // Google marks emails verified; email/password sign-up doesn't, so do it by hand for the admin only.
  const sql = postgres(E2E_ENV.DATABASE_URL, { max: 1 });
  await sql`update "user" set email_verified = true where email = ${E2E_ENV.ADMIN_EMAIL}`;
  await sql.end();
  await api.storageState({ path: ADMIN_STATE });
  await api.dispose();
});

setup("reader session with family password", async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.20" } });
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: E2E_BASE_URL },
    data: { email: "reader@e2e.test", password: "reader-password-123", name: "Mum" },
  });
  expect(res.ok()).toBeTruthy();
  await page.goto("/unlock");
  await page.getByLabel("Password").fill(E2E_ENV.FAMILY_PASSWORD);
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL("/");
  await context.storageState({ path: READER_STATE });
  await context.close();
});
