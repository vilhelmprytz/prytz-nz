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
