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

test("opens on the latest hop; Hela resan zooms out to everything", async ({ page }) => {
  const ids = seedIds();
  await page.goto("/");
  const dot = (id: string) => page.locator(`.trip-dot[data-post-id="${id}"]`);
  // Newest post (Auckland) and the place before it (Museum X, San Francisco); Stockholm is off the map.
  await expect(dot(ids.auckland)).toBeInViewport();
  await expect(dot(ids.museum)).toBeInViewport();
  await expect(dot(ids.stockholm)).not.toBeInViewport();

  await page.getByRole("button", { name: "Hela resan" }).click();
  await expect(dot(ids.stockholm)).toBeInViewport();
  await expect(dot(ids.auckland)).toBeInViewport();
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
  await page.getByRole("button", { name: "Dölj kartan" }).first().click();
  await expect(page.getByRole("button", { name: "Visa kartan" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Visa kartan" })).toBeVisible();
  await page.getByRole("button", { name: "Visa kartan" }).click();
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

test("street map: tiles, credits and route colour switch, and the choice is remembered", async ({ page }) => {
  await page.goto("/");
  const map = page.getByTestId("trip-map");
  const tiles = map.locator("img.leaflet-tile");
  const route = map.locator(".leaflet-overlay-pane path");
  const credits = map.locator(".leaflet-control-attribution");

  // Satellite by default.
  await expect(map.getByRole("button", { name: "Satellit" })).toHaveAttribute("aria-pressed", "true");
  await expect(tiles.first()).toHaveAttribute("src", /World_Imagery/);
  await expect(route).toHaveAttribute("stroke", "#ffffff");

  await map.getByRole("button", { name: "Karta", exact: true }).click();
  await expect(map.getByRole("button", { name: "Karta", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(tiles.first()).toHaveAttribute("src", /World_Street_Map/);
  await expect(map.locator('img.leaflet-tile[src*="World_Imagery"]')).toHaveCount(0);
  await expect(credits).toContainText("OpenStreetMap");
  await expect(credits).not.toContainText("Vantor");
  await expect(route).toHaveAttribute("stroke", "#2147d6");
  await expect(page.locator(".trip-dot")).toHaveCount(6);

  await page.reload();
  await expect(map.getByRole("button", { name: "Karta", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(tiles.first()).toHaveAttribute("src", /World_Street_Map/);
  await expect(route).toHaveAttribute("stroke", "#2147d6");

  await map.getByRole("button", { name: "Satellit" }).click();
  await expect(tiles.first()).toHaveAttribute("src", /World_Imagery/);
  await expect(credits).toContainText("Vantor");
  await expect(route).toHaveAttribute("stroke", "#ffffff");
});

test("phone: map credits take one line until tapped", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const map = page.getByTestId("trip-map");
  await map.getByRole("button", { name: "Karta", exact: true }).click();
  const credits = map.locator(".leaflet-control-attribution");
  await expect(credits).toContainText("OpenStreetMap");
  const oneLine = (await credits.boundingBox())!.height;
  expect(oneLine).toBeLessThan(24);
  await credits.click({ position: { x: 300, y: 8 } });
  await expect.poll(async () => (await credits.boundingBox())!.height).toBeGreaterThan(oneLine * 2);
});
