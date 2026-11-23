import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_BASE_URL, E2E_ENV } from "./env";

const QUESTION = "Vill du sluta få mejl om nya inlägg på prytz.nz?";
const DONE = "Klart. Du får inga fler mejl om nya inlägg.";
const BAD = "Länken fungerar inte.";

let sql: postgres.Sql;
let token: string;

async function unsubscribedAt(): Promise<Date | null> {
  const [row] = await sql<{ unsubscribed_at: Date | null }[]>`
    select unsubscribed_at from post_email_subscribers where unsubscribe_token = ${token}`;
  return row.unsubscribed_at;
}

test.beforeAll(async () => {
  sql = postgres(E2E_ENV.DATABASE_URL, { max: 1 });
  await sql`
    insert into post_email_subscribers (user_id)
    select id from "user" where email = 'reader@e2e.test'
    on conflict do nothing`;
  const [row] = await sql<{ unsubscribe_token: string }[]>`
    select s.unsubscribe_token from post_email_subscribers s
    join "user" u on u.id = s.user_id where u.email = 'reader@e2e.test'`;
  token = row.unsubscribe_token;
  await sql`update post_email_subscribers set unsubscribed_at = null where unsubscribe_token = ${token}`;
});

test.afterAll(async () => {
  await sql`update post_email_subscribers set unsubscribed_at = null where unsubscribe_token = ${token}`;
  await sql.end();
});

// Default context: no family-password cookie and no sign-in.
test("unsubscribe and undo without the family password", async ({ page }) => {
  await page.goto(`/unsubscribe?t=${token}`);
  await expect(page).toHaveURL(/\/unsubscribe\?t=/);
  await expect(page.getByText(QUESTION)).toBeVisible();
  await page.getByRole("button", { name: "Sluta skicka mejl" }).click();
  await expect(page.getByText(DONE)).toBeVisible();
  expect(await unsubscribedAt()).not.toBeNull();
  await page.getByRole("button", { name: "Ångra" }).click();
  await expect(page.getByText(QUESTION)).toBeVisible();
  expect(await unsubscribedAt()).toBeNull();
});

test("opening the link changes nothing", async ({ page }) => {
  await page.goto(`/unsubscribe?t=${token}`);
  await expect(page.getByText(QUESTION)).toBeVisible();
  expect(await unsubscribedAt()).toBeNull();
});

test("bad links say so", async ({ page }) => {
  for (const path of ["/unsubscribe?t=nope", "/unsubscribe", `/unsubscribe?t=${token}&t=${token}`, `/unsubscribe?t=${"0".repeat(64)}`]) {
    await page.goto(path);
    await expect(page.getByText(BAD)).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(0);
  }
});

test("one-click POST from a mail provider, and GET opens the page", async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: E2E_BASE_URL });
  const form = { "List-Unsubscribe": "One-Click" };
  const res = await api.post(`/unsubscribe/one-click?t=${token}`, { form });
  expect(res.status()).toBe(200);
  expect(await unsubscribedAt()).not.toBeNull();
  await sql`update post_email_subscribers set unsubscribed_at = null where unsubscribe_token = ${token}`;

  expect((await api.post(`/unsubscribe/one-click?t=${"0".repeat(64)}`, { form })).status()).toBe(200);
  expect((await api.post("/unsubscribe/one-click?t=nope", { form })).status()).toBe(200);

  const get = await api.get(`/unsubscribe/one-click?t=${token}`, { maxRedirects: 0 });
  expect(get.status()).toBe(303);
  expect(get.headers()["location"]).toMatch(/\/unsubscribe\?t=[0-9a-f]{64}$/);
  expect(await unsubscribedAt()).toBeNull();
  await api.dispose();
});
