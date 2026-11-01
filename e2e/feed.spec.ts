import { expect, test } from "@playwright/test";
import { READER_STATE } from "./env";
import { seedIds } from "./seed";

test.use({ storageState: READER_STATE });

test("newest first, drafts hidden, line breaks kept", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Vilhelm's trip" })).toBeVisible();
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

test("'+3' opens every photo in the post, and 'Show fewer' folds it back", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  const post = page.locator(`#post-${ids.museum}`);
  const gallery = post.getByTestId("gallery");
  await expect(gallery.getByRole("button")).toHaveCount(5);
  await post.getByRole("button", { name: "Show all 8 photos" }).click();
  await expect(gallery.getByRole("button")).toHaveCount(7);
  await expect(gallery.getByText("+3")).toHaveCount(0);
  // Opening a photo from the open grid starts at that photo.
  await gallery.getByRole("button").nth(5).click();
  await expect(page.getByText("Museum X · 7 / 8")).toBeVisible();
  await page.keyboard.press("Escape");
  await post.getByRole("button", { name: "Show fewer" }).click();
  await expect(gallery.getByRole("button")).toHaveCount(5);
});

test("miniatures in the big view jump straight to a photo and follow along", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  await page.locator(`#post-${ids.museum} figure`).click();
  const viewer = page.getByRole("dialog");
  const minis = viewer.getByTestId("miniatures").getByRole("button");
  await expect(minis).toHaveCount(8);
  await expect(minis.nth(0)).toHaveAttribute("aria-current", "true");
  await viewer.getByRole("button", { name: "Photo 6 of 8" }).click();
  await expect(page.getByText("Museum X · 6 / 8")).toBeVisible();
  await expect(minis.nth(5)).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Museum X · 7 / 8")).toBeVisible();
  await expect(minis.nth(6)).toHaveAttribute("aria-current", "true");
  await expect(minis.nth(5)).not.toHaveAttribute("aria-current", "true");
});

test("a post with a single photo has no miniatures", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  await page.locator(`#post-${ids.stockholm} figure`).click();
  await expect(page.getByRole("dialog").getByTestId("miniatures")).toHaveCount(0);
});
