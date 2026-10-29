import { expect, test } from "@playwright/test";
import { ADMIN_STATE, READER_STATE } from "./env";

test("anonymous /admin goes to login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL("/admin/login");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test.describe("admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("sees admin and the feed without the family password", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Posts" })).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL("/");
  });
});

test.describe("non-admin", () => {
  test.use({ storageState: READER_STATE });

  test("is refused", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL("/admin/login");
    await expect(page.getByText("which can't post")).toBeVisible();
  });
});
