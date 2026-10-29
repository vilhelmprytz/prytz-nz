import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.10" } });

test("redirects to /unlock, rejects a wrong password, accepts the right one and honours next", async ({ page }) => {
  await page.goto("/?post=abc");
  await expect(page).toHaveURL(/\/unlock\?next=%2F%3Fpost%3Dabc/);
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("That's not the password.")).toBeVisible();
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL("/?post=abc");
  await expect(page.getByText("Vilhelm's trip")).toBeVisible();
});

test.describe("lockout", () => {
  test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.11" } });

  test("5 wrong tries lock the IP even for the right password", async ({ page }) => {
    await page.goto("/unlock");
    // Wait for each server action to finish: React resets the form afterwards, which would clear the next fill.
    const submit = async (password: string) => {
      await page.getByLabel("Password").fill(password);
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST"),
        page.getByRole("button", { name: "Open" }).click(),
      ]);
      // React clears the form once the action settles, which can land after the response.
      await expect(page.getByLabel("Password")).toHaveValue("");
    };
    for (let i = 0; i < 5; i++) await submit("nope");
    await submit("e2e-password");
    await expect(page.getByText("Too many tries. Try again in 15 minutes.")).toBeVisible();
  });
});

test("photos and API answer 401 without the cookie, and every response is noindex", async ({ request }) => {
  const r = await request.get("/photos/00000000-0000-0000-0000-000000000000/display");
  expect(r.status()).toBe(401);
  expect((await request.get("/api/feed")).status()).toBe(401);
  expect((await request.get("/unlock")).headers()["x-robots-tag"]).toBe("noindex, nofollow");
});
