import { expect, test } from "@playwright/test";
import { READER_STATE } from "./env";
import { seedIds } from "./seed";

test.use({ storageState: READER_STATE });

test("one dot per published post; clicking the oldest scrolls to it", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  await expect(page.locator(".trip-dot")).toHaveCount(4);
  await page.locator(`.trip-dot[data-post-id="${ids.stockholm}"]`).click();
  await expect(page.locator(`#post-${ids.stockholm}`)).toBeInViewport();
});

test("scrolling activates the matching dot", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  // Put the post's top at the top of the feed, so it covers the middle "active" band.
  await page.locator(`#post-${ids.landed}`).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(page.locator(`.trip-dot[data-post-id="${ids.landed}"]`)).toHaveClass(/active/);
});

test("hide map persists across reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hide map" }).first().click();
  await expect(page.getByRole("button", { name: "Show map" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Show map" })).toBeVisible();
  await page.getByRole("button", { name: "Show map" }).click();
  await expect(page.locator(".trip-dot")).toHaveCount(4);
});

test("phone: map strip above feed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const map = await page.getByTestId("trip-map").boundingBox();
  const first = await page.locator("article").first().boundingBox();
  expect(map!.y).toBeLessThan(first!.y);
  expect(map!.height).toBeGreaterThan(200);
});
