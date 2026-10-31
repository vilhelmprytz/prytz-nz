import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE } from "./env";
import { makeJpeg } from "./fixtures";

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
