import { expect, test } from "@playwright/test";
import { READER_STATE } from "./env";
import { seedIds } from "./seed";

test.use({ storageState: READER_STATE });

test("one dot per place; clicking the oldest scrolls to it", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  // Four published posts; "Landed!" is a travel day with three places.
  await expect(page.locator(".trip-dot")).toHaveCount(6);
  await page.locator(`.trip-dot[data-post-id="${ids.stockholm}"]`).click();
  await expect(page.locator(`#post-${ids.stockholm}`)).toBeInViewport();
});

test("scrolling to a travel day lights up all its dots", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  // Put the post's top at the top of the feed, so it covers the middle "active" band.
  await page.locator(`#post-${ids.landed}`).evaluate((el) => el.scrollIntoView({ block: "start" }));
  const dots = page.locator(`.trip-dot[data-post-id="${ids.landed}"]`);
  await expect(dots).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(dots.nth(i)).toHaveClass(/active/);
  await expect(page.locator(`.trip-dot[data-post-id="${ids.museum}"]`)).not.toHaveClass(/active/);
});

test("clicking a travel day's middle dot jumps to that post", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  await page.locator(`.trip-dot[data-post-id="${ids.landed}"]`).nth(1).click();
  await expect(page.locator(`#post-${ids.landed}`)).toBeInViewport();
});

test("hide map persists across reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hide map" }).first().click();
  await expect(page.getByRole("button", { name: "Show map" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Show map" })).toBeVisible();
  await page.getByRole("button", { name: "Show map" }).click();
  await expect(page.locator(".trip-dot")).toHaveCount(6);
});

test("phone: map strip above feed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const map = await page.getByTestId("trip-map").boundingBox();
  const first = await page.locator("article").first().boundingBox();
  expect(map!.y).toBeLessThan(first!.y);
  expect(map!.height).toBeGreaterThan(200);
});
