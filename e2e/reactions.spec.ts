import { expect, test } from "@playwright/test";
import { E2E_ENV, READER_STATE } from "./env";
import { seedIds } from "./seed";

test.describe("signed-in reader", () => {
  test.use({ storageState: READER_STATE });

  test("toggle heart shows 'You', survives reload, toggles off", async ({ page }) => {
    const ids = seedIds();
    await page.goto("/");
    const reactions = page.locator(`#post-${ids.museum}`).getByTestId("reactions");
    // The UI updates optimistically; wait for the server action before reloading.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      reactions.getByRole("button", { name: "❤️" }).click(),
    ]);
    await expect(reactions.getByText("❤️ You")).toBeVisible();
    await page.reload();
    await expect(reactions.getByText("❤️ You")).toBeVisible();
    await reactions.getByRole("button", { name: /❤️/ }).click();
    await expect(reactions.getByText("❤️ You")).toHaveCount(0);
  });
});

test.describe("gated but signed out", () => {
  test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.30" } });

  test("tapping a reaction starts Google sign-in", async ({ page }) => {
    const ids = seedIds();
    await page.goto("/unlock");
    await page.getByLabel("Password").fill(E2E_ENV.FAMILY_PASSWORD);
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page).toHaveURL("/");
    const reactions = page.locator(`#post-${ids.museum}`).getByTestId("reactions");
    const signIn = page.waitForRequest(/\/api\/auth\/sign-in\/social/);
    await reactions.getByRole("button", { name: "❤️" }).click();
    await signIn;
  });
});

test("server action POST without gate cookie never reaches the action", async ({ request }) => {
  const res = await request.post("/", { headers: { "next-action": "x" }, maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toMatch(/^\/unlock/);
});
