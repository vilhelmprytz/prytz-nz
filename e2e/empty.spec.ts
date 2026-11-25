import { expect, test } from "@playwright/test";
import { E2E_ENV } from "./env";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.40" } });

test("no posts yet shows an empty state", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (e) => errors.push(e));
  await page.goto("/unlock");
  await page.getByLabel("Lösenord").fill(E2E_ENV.FAMILY_PASSWORD);
  await page.getByRole("button", { name: "Öppna" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Inga inlägg än. Titta in snart igen.")).toBeVisible();
  await expect(page.getByTestId("trip-map")).toBeVisible();
  await expect(page.locator(".trip-dot")).toHaveCount(0);
  expect(errors).toEqual([]);
});
