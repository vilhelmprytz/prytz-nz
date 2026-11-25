import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { ADMIN_STATE, E2E_ENV } from "./env";

test.use({ storageState: ADMIN_STATE, viewport: { width: 390, height: 844 } });

const ANNA = "anna@e2e.test";
let sql: postgres.Sql;

test.beforeAll(async () => {
  sql = postgres(E2E_ENV.DATABASE_URL, { max: 1 });
  await sql`delete from post_email_subscribers where email = ${ANNA}`;
});

test.afterAll(async () => {
  await sql`delete from post_email_subscribers where email = ${ANNA}`;
  await sql.end();
});

test("add, refuse duplicates, remove, turn back on", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("link", { name: "Subscribers" }).click();
  await expect(page.getByRole("heading", { name: "Subscribers" })).toBeVisible();

  const email = page.getByLabel("Email");
  const status = page.getByRole("status");
  const subscribed = page.getByTestId("subscribed");
  const unsubscribed = page.getByTestId("unsubscribed");

  await page.getByLabel("Name (optional)").fill("Anna Test");
  await email.fill("Anna@E2E.test");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(status).toHaveText(`Added ${ANNA}.`);
  await expect(subscribed.getByRole("listitem").filter({ hasText: ANNA })).toContainText("added by you");
  await expect(email).toHaveValue("");

  await email.fill(ANNA);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(status).toHaveText(`${ANNA} is already on the list.`);

  await subscribed.getByRole("listitem").filter({ hasText: ANNA }).getByRole("button", { name: "Remove" }).click();
  await expect(unsubscribed.getByRole("listitem").filter({ hasText: ANNA })).toContainText("removed by you");
  await expect(subscribed.getByRole("listitem").filter({ hasText: ANNA })).toHaveCount(0);

  await email.fill(ANNA);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(status).toHaveText(`${ANNA} is on the list but unsubscribed. Use Turn back on below.`);

  await unsubscribed.getByRole("listitem").filter({ hasText: ANNA }).getByRole("button", { name: "Turn back on" }).click();
  await expect(subscribed.getByRole("listitem").filter({ hasText: ANNA })).toContainText("added by you");
  await expect(unsubscribed.getByRole("listitem").filter({ hasText: ANNA })).toHaveCount(0);
});

test("an address the browser accepts but isn't one → message, fields kept", async ({ page }) => {
  await page.goto("/admin/subscribers");
  await page.getByLabel("Email").fill("anna@localhost");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("status")).toHaveText("That isn't an email address.");
  await expect(page.getByLabel("Email")).toHaveValue("anna@localhost");
});
