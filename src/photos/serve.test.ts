import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { photos, posts } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { createFsStorage } from "@/storage/fs";
import { servePhoto } from "./serve";

let deps: { db: Db; storage: ReturnType<typeof createFsStorage> };

beforeEach(async () => {
  deps = { db: await createTestDb(), storage: createFsStorage(await mkdtemp(path.join(tmpdir(), "pz-serve-"))) };
});

async function seedPhoto(status: "pending" | "ready", postStatus: "draft" | "published"): Promise<string> {
  const [post] = await deps.db.insert(posts).values({ status: postStatus }).returning();
  const [photo] = await deps.db
    .insert(photos)
    .values({ postId: post.id, displayKey: "k/d.webp", thumbKey: "k/t.webp", contentType: "image/webp", width: 1, height: 1, status })
    .returning();
  await deps.storage.put("k/d.webp", new Uint8Array([1, 2, 3]), "image/webp");
  await deps.storage.put("k/t.webp", new Uint8Array([4]), "image/webp");
  return photo.id;
}

test("reader gets a published photo with immutable private caching", async () => {
  const id = await seedPhoto("ready", "published");
  const res = await servePhoto(deps, { photoId: id, size: "display", hasGate: true, isAdmin: false });
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  expect(res.headers.get("content-type")).toBe("image/webp");
  expect(res.headers.get("content-length")).toBe("3");
});

test("no gate and not admin → 401", async () => {
  const id = await seedPhoto("ready", "published");
  expect((await servePhoto(deps, { photoId: id, size: "display", hasGate: false, isAdmin: false })).status).toBe(401);
});

test("draft photo: 404 for readers, 200 for admin", async () => {
  const id = await seedPhoto("ready", "draft");
  expect((await servePhoto(deps, { photoId: id, size: "thumb", hasGate: true, isAdmin: false })).status).toBe(404);
  expect((await servePhoto(deps, { photoId: id, size: "thumb", hasGate: false, isAdmin: true })).status).toBe(200);
});

test.each([
  ["pending photo", "pending"],
  ["bad size", "ready"],
])("%s → 404", async (_, st) => {
  const id = await seedPhoto(st as "pending" | "ready", "published");
  const size = st === "ready" ? "huge" : "display";
  expect((await servePhoto(deps, { photoId: id, size, hasGate: true, isAdmin: false })).status).toBe(404);
});

test("non-uuid id → 404 without querying", async () => {
  expect((await servePhoto(deps, { photoId: "nope", size: "display", hasGate: true, isAdmin: false })).status).toBe(404);
});
