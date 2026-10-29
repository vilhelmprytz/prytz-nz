import { expect, test } from "@playwright/test";
import { READER_STATE } from "./env";
import { seedIds } from "./seed";

test.use({ storageState: READER_STATE });

test("newest first, drafts hidden, line breaks kept", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  await expect(page.locator("article h2")).toHaveText(["Auckland", "Museum X", "Landed!", "Leaving Stockholm"]);
  await expect(page.getByText("Secret draft")).toHaveCount(0);
  await expect(page.locator(`#post-${ids.museum}`).getByText("+3")).toBeVisible();
  const whiteSpace = await page.locator(`#post-${ids.museum} p`).evaluate((e) => getComputedStyle(e).whiteSpace);
  expect(whiteSpace).toBe("pre-line");
});

test("draft photo URL is 404 for readers", async ({ page }) => {
  const res = await page.request.get(`/photos/${seedIds().draftPhoto}/display`);
  expect(res.status()).toBe(404);
});

test("lightbox: open, arrow, escape", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  await page.locator(`#post-${ids.museum} figure`).click();
  await expect(page.getByText("Museum X · 1 / 8")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Museum X · 2 / 8")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Museum X · 2 / 8")).toHaveCount(0);
});

test("deep link scrolls to the post", async ({ page }) => {
  const ids = seedIds();
  await page.goto(`/?post=${ids.stockholm}`);
  await expect(page.locator(`#post-${ids.stockholm}`)).toBeInViewport();
});
