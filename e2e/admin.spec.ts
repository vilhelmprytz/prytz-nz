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
  await expect(page.getByRole("listitem").filter({ hasText: "Queenstown" })).toContainText("Published");
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
