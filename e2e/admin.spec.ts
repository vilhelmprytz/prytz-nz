import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE } from "./env";
import { makeClip, makeJpeg } from "./fixtures";

test.use({ storageState: ADMIN_STATE, viewport: { width: 390, height: 844 } });

const jpeg = (name: string, buffer: Buffer) => ({ name, mimeType: "image/jpeg", buffer });

async function newPost(page: Page) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "New post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\//);
}

test("create, fill from EXIF, publish, appears as published", async ({ page }) => {
  await newPost(page);
  const a = await makeJpeg(page, { gps: [-45.0312, 168.6626], date: "2026:11:02 10:15:00" });
  const b = await makeJpeg(page, { date: "2026:11:02 09:40:00" });
  await page.getByLabel("Add photos").setInputFiles([jpeg("a.jpg", a), jpeg("b.jpg", b)]);
  await expect(page.getByTestId("photo-tile").filter({ hasText: "Done" })).toHaveCount(2);
  await expect(page.getByLabel("Date")).toHaveValue("2026-11-02T09:40");
  await expect(page.getByTestId("location-source")).toHaveText("From photo GPS");
  await page.getByLabel("Title").fill("Queenstown");
  await page.getByLabel("Place").fill("Queenstown, New Zealand");
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
  await page.goto("/admin");
  const row = page.getByRole("listitem").filter({ hasText: "Queenstown" });
  await expect(row).toContainText("Published");

  // Clean up so the reader specs see only seeded posts; this also covers Delete.
  await row.getByRole("link").click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL("/admin");
  await expect(page.getByRole("listitem").filter({ hasText: "Queenstown" })).toHaveCount(0);
});

test("no GPS prompts for location and publish lists errors", async ({ page }) => {
  await newPost(page);
  await page.getByLabel("Add photos").setInputFiles([jpeg("c.jpg", await makeJpeg(page, {}))]);
  await expect(page.getByText("No location in these photos.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Add a title")).toBeVisible();
  await expect(page.getByText("Set a location")).toBeVisible();
});

test("rotated photo stored upright", async ({ page }) => {
  await newPost(page);
  await page.getByLabel("Add photos").setInputFiles([jpeg("r.jpg", await makeJpeg(page, { orientation: 6 }))]);
  const tile = page.getByTestId("photo-tile").filter({ hasText: "Done" });
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveAttribute("data-width", "300");
  await expect(tile).toHaveAttribute("data-height", "400");
});

test("failed upload shows Retry and keeps finished photos", async ({ page }) => {
  test.setTimeout(60_000);
  await newPost(page);
  await page.getByLabel("Add photos").setInputFiles([jpeg("one.jpg", await makeJpeg(page, {}))]);
  await expect(page.getByTestId("photo-tile").filter({ hasText: "Done" })).toHaveCount(1);

  await page.route("**/api/dev-storage/**", (route) => route.abort());
  await page.getByLabel("Add photos").setInputFiles([jpeg("two.jpg", await makeJpeg(page, {}))]);
  const failed = page.getByTestId("photo-tile").filter({ has: page.getByRole("button", { name: "Retry" }) });
  await expect(failed).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId("photo-tile").filter({ hasText: "Done" })).toHaveCount(1);

  await page.unroute("**/api/dev-storage/**");
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("photo-tile").filter({ hasText: "Done" })).toHaveCount(2);
});

test("draft survives reload", async ({ page }) => {
  await newPost(page);
  await page.getByLabel("Title").fill("Half-written");
  await expect(page.getByText("Saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue("Half-written");
});

test("tapping the map three times makes a travel day with three dots", async ({ page }) => {
  await newPost(page);
  const postId = page.url().split("/").pop()!;
  await page.getByLabel("Add photos").setInputFiles([jpeg("t.jpg", await makeJpeg(page, {}))]);
  await expect(page.getByTestId("photo-tile").filter({ hasText: "Done" })).toHaveCount(1);

  const map = page.getByTestId("location-map");
  for (const [x, y] of [[80, 80], [180, 120], [280, 160]]) await map.click({ position: { x, y } });
  const points = page.getByTestId("route-point");
  await expect(points).toHaveCount(3);
  await expect(points).toHaveText(["1", "2", "3"]);
  await expect(page.getByTestId("location-source")).toHaveText("Pinned by hand");

  // Tapping a point removes it; tapping the map again adds one at the end.
  await points.nth(1).click();
  await expect(points).toHaveCount(2);
  await map.click({ position: { x: 200, y: 200 } });
  await expect(points).toHaveCount(3);

  await page.getByLabel("Title").fill("Travel day");
  await page.getByLabel("Date").fill("2026-10-16T08:00");
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
  await page.goto("/");
  await expect(page.locator(`.trip-dot[data-post-id="${postId}"]`)).toHaveCount(3);

  // Clean up so the reader specs see only seeded posts.
  await page.goto(`/admin/posts/${postId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL("/admin");
});

test("photos keep the order they were picked in, and dragging reorders them", async ({ page }) => {
  test.setTimeout(90_000);
  await newPost(page);
  const postId = page.url().split("/").pop()!;
  const tiles = page.getByTestId("photo-tile");
  const order = () => tiles.evaluateAll((els) => els.map((el) => el.getAttribute("data-photo-id")));

  // Hold back the first photo's upload so it finishes last: the order must still follow the picking.
  let delayed = false;
  await page.route("**/api/dev-storage/**", async (route) => {
    if (!delayed) {
      delayed = true;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    await route.continue();
  });
  const files = await Promise.all(["a", "b", "c"].map(async (n) => jpeg(`${n}.jpg`, await makeJpeg(page, {}))));
  await page.getByLabel("Add photos").setInputFiles(files);
  await expect(tiles.filter({ hasText: "Done" })).toHaveCount(3);
  await page.unroute("**/api/dev-storage/**");
  const picked = await order();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.reload();
  expect(await order()).toEqual(picked);

  // Drag the third photo onto the first.
  const from = (await tiles.nth(2).boundingBox())!;
  const to = (await tiles.nth(0).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 3);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 10, from.y + from.height / 3, { steps: 5 });
  await page.mouse.move(to.x + to.width / 3, to.y + to.height / 3, { steps: 15 });
  await page.mouse.up();
  const dragged = [picked[2], picked[0], picked[1]];
  await expect.poll(order).toEqual(dragged);
  // Nothing was starred, so the first photo is the headline.
  await expect(tiles.first().getByRole("button", { name: "Headline" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Saved")).toBeVisible();
  await page.reload();
  expect(await order()).toEqual(dragged);

  // The site shows the headline first, then the rest in this order.
  await page.getByLabel("Title").fill("Reordered");
  await page.getByLabel("Date").fill("2026-10-17T09:00");
  await page.getByTestId("location-map").click({ position: { x: 100, y: 100 } });
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
  await page.goto(`/?post=${postId}`);
  const post = page.locator(`#post-${postId}`);
  await expect(post.locator("figure img")).toHaveAttribute("src", `/photos/${dragged[0]}/display`);
  const thumbs = await post.locator("button img").evaluateAll((els) => els.map((el) => el.getAttribute("src")));
  expect(thumbs).toEqual([`/photos/${dragged[1]}/thumb`, `/photos/${dragged[2]}/thumb`]);

  // Clean up so the reader specs see only seeded posts.
  await page.goto(`/admin/posts/${postId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL("/admin");
});

async function publishCurrent(page: Page, title: string) {
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Date").fill("2026-10-19T09:00");
  await page.getByTestId("location-map").click({ position: { x: 100, y: 100 } });
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
}

async function deleteCurrent(page: Page) {
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL("/admin");
}

test("a clip uploads next to photos, never takes the headline, and is served in ranges", async ({ page }) => {
  test.setTimeout(120_000);
  await newPost(page);
  const clip = await makeClip(page, { seconds: 2, width: 1280, height: 720 });
  await page.getByLabel("Add photos").setInputFiles([
    { name: "clip.mp4", mimeType: "video/mp4", buffer: clip },
    jpeg("p.jpg", await makeJpeg(page, {})),
  ]);
  const tiles = page.getByTestId("photo-tile");
  await expect(tiles.filter({ hasText: "Done" })).toHaveCount(2, { timeout: 60_000 });
  const clipTile = page.locator('[data-testid="photo-tile"][data-kind="video"]');
  await expect(clipTile).toHaveCount(1);
  await expect(clipTile.getByRole("button", { name: "Headline" })).toHaveCount(0);
  await expect(page.locator('[data-testid="photo-tile"][data-kind="photo"]').getByRole("button", { name: "Headline" }))
    .toHaveAttribute("aria-pressed", "true");
  const clipId = await clipTile.getAttribute("data-photo-id");
  await publishCurrent(page, "Clip day");

  const full = await page.request.get(`/photos/${clipId}/video`);
  expect(full.status()).toBe(200);
  expect(full.headers()["content-type"]).toBe("video/mp4");
  const part = await page.request.get(`/photos/${clipId}/video`, { headers: { Range: "bytes=0-99" } });
  expect(part.status()).toBe(206);
  expect((await part.body()).length).toBe(100);
  await deleteCurrent(page);
});

test("Retry after a failed clip upload doesn't compress again", async ({ page }) => {
  test.setTimeout(120_000);
  await newPost(page);
  const clip = await makeClip(page, { seconds: 1, width: 640, height: 360 });
  await page.route("**/api/dev-storage/**/video.mp4", (route) => route.abort());
  await page.getByLabel("Add photos").setInputFiles([{ name: "clip.mp4", mimeType: "video/mp4", buffer: clip }]);
  const tile = page.locator('[data-testid="photo-tile"][data-kind="video"]');
  await expect(tile.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 60_000 });
  await page.unroute("**/api/dev-storage/**/video.mp4");

  // Record every text the tile shows from here on.
  await tile.evaluate((el) => {
    const seen: string[] = [];
    (window as unknown as { seen: string[] }).seen = seen;
    new MutationObserver(() => seen.push(el.textContent ?? "")).observe(el, { subtree: true, childList: true, characterData: true });
  });
  await tile.getByRole("button", { name: "Retry" }).click();
  await expect(tile).toContainText("Done", { timeout: 60_000 });
  const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
  expect(seen.some((t) => t.includes("Compressing"))).toBe(false);
  await deleteCurrent(page);
});

test("the screen wake lock is released once every clip is done", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const w = window as unknown as { locks: { released: boolean }[] };
    w.locks = [];
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          const lock = {
            released: false,
            release: async () => {
              lock.released = true;
            },
          };
          w.locks.push(lock);
          return lock;
        },
      },
    });
  });
  await newPost(page);
  const a = await makeClip(page, { seconds: 1, width: 640, height: 360 });
  const b = await makeClip(page, { seconds: 1, width: 640, height: 360 });
  await page.getByLabel("Add photos").setInputFiles([
    { name: "a.mp4", mimeType: "video/mp4", buffer: a },
    { name: "b.mp4", mimeType: "video/mp4", buffer: b },
  ]);
  await expect(page.getByTestId("photo-tile").filter({ hasText: "Done" })).toHaveCount(2, { timeout: 60_000 });
  const held = () =>
    page.evaluate(() => (window as unknown as { locks: { released: boolean }[] }).locks.filter((l) => !l.released).length);
  await expect.poll(held).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { locks: unknown[] }).locks.length)).toBeGreaterThan(0);
  await deleteCurrent(page);
});

test("the location picker switches to a street map without adding a place", async ({ page }) => {
  await newPost(page);
  const picker = page.getByTestId("location-picker");
  const tiles = picker.locator("img.leaflet-tile");
  await expect(tiles.first()).toHaveAttribute("src", /World_Imagery/);

  await picker.getByRole("button", { name: "Map", exact: true }).click();
  await expect(picker.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(tiles.first()).toHaveAttribute("src", /World_Street_Map/);
  await expect(picker.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
  await expect(page.getByTestId("route-point")).toHaveCount(0);

  // The route line follows the map: blue on the street map.
  const map = page.getByTestId("location-map");
  for (const [x, y] of [[80, 80], [200, 150]]) await map.click({ position: { x, y } });
  await expect(page.getByTestId("route-point")).toHaveCount(2);
  await expect(picker.locator(".leaflet-overlay-pane path")).toHaveAttribute("stroke", "#2147d6");
  await picker.getByRole("button", { name: "Satellite" }).click();
  await expect(picker.locator(".leaflet-overlay-pane path")).toHaveAttribute("stroke", "#ffffff");
  await expect(page.getByTestId("route-point")).toHaveCount(2);

  await deleteCurrent(page);
});

test("the test email button reports that email is off", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Send test email" }).click();
  await expect(page.getByRole("status")).toHaveText("Email is off: SMTP_HOST isn't set.");
});
