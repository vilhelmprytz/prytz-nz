import { expect, test } from "@playwright/test";
import { READER_STATE } from "./env";
import { deletePost } from "../src/posts/repo";
import { makeClip } from "./fixtures";
import { seedIds } from "./seed";
import { openSeedDb, seedPost, type SeedItem } from "./seed-helpers";

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

test("a clip shows ▶ and its length, plays in the big view, and stops when you move on", async ({ page }) => {
  const ids = seedIds();
  await page.goto(`/?post=${ids.auckland}`);
  const tile = page.locator(`#post-${ids.auckland}`).getByRole("button", { name: "Video 3" });
  await expect(tile).toContainText("0:02");
  await expect(tile).toContainText("▶");
  await tile.click();
  const viewer = page.getByRole("dialog");
  await expect(page.getByText("Auckland · 3 / 3")).toBeVisible();
  const video = viewer.getByTestId("clip");
  await expect(video).toHaveAttribute("src", /\/photos\/.+\/video$/);
  await expect(video).toHaveAttribute("controls", "");
  // Sized from the clip itself, not from whatever the poster or the browser guesses before loading.
  expect((await video.boundingBox())!.width).toBeGreaterThan(300);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    return v.play();
  });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.3);
  await expect(viewer.getByTestId("miniatures").getByText("▶")).toHaveCount(1);
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("Auckland · 2 / 3")).toBeVisible();
  expect(await page.evaluate(() => [...document.querySelectorAll("video")].every((v) => v.paused))).toBe(true);
});

test("a clip as the fifth tile keeps '+N', and keeps ▶ and its length in the open grid", async ({ page }) => {
  const seed = openSeedDb();
  const clip = await makeClip(page, { seconds: 1, width: 320, height: 180 });
  const items: SeedItem[] = ["photo", "photo", "photo", "photo", "photo", { clip, durationMs: 1000 }, "photo", "photo"];
  const { id } = await seedPost(seed, { title: "Clip in the grid", date: "2026-10-12", points: [{ lat: 0, lng: 0 }], items });
  try {
    await page.goto(`/?post=${id}`);
    const gallery = page.locator(`#post-${id}`).getByTestId("gallery");
    await expect(gallery.getByText("+3")).toBeVisible();
    await page.locator(`#post-${id}`).getByRole("button", { name: "Show all 8 photos" }).click();
    const clipTile = gallery.getByRole("button", { name: "Video 6" });
    await expect(clipTile).toContainText("▶");
    await expect(clipTile).toContainText("0:01");
  } finally {
    await deletePost(seed.db, seed.storage, id);
    await seed.close();
  }
});
