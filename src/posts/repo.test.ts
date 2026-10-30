import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { photos, posts } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { createFsStorage } from "@/storage/fs";
import {
  cleanupStalePhotos,
  completePhoto,
  createDraft,
  createPendingPhoto,
  deletePost,
  getPostForEdit,
  listAdminPosts,
  listFeedPage,
  listRoutePoints,
  removePhoto,
  savePostFields,
  setPublished,
} from "./repo";

let db: Db;
let storage: ReturnType<typeof createFsStorage>;
const NOW = new Date("2026-11-02T12:00:00Z");
const meta = { takenAtLocal: null, utcOffset: null, lat: null, lng: null, width: 4, height: 3, contentType: "image/webp" as const };

beforeEach(async () => {
  db = await createTestDb();
  storage = createFsStorage(await mkdtemp(path.join(tmpdir(), "pz-repo-")));
});

async function uploadPhoto(postId: string, opts: { displayBytes?: number; contentType?: string } = {}) {
  const p = await createPendingPhoto(db, postId, meta);
  await storage.put(p.displayKey, new Uint8Array(opts.displayBytes ?? 10), opts.contentType ?? "image/webp");
  await storage.put(p.thumbKey, new Uint8Array(5), opts.contentType ?? "image/webp");
  return p;
}

async function readyPhoto(postId: string) {
  const p = await uploadPhoto(postId);
  const r = await completePhoto(db, storage, p.photoId);
  if (!r.ok) throw new Error(r.reason);
  return r.photo;
}

async function makePublished(
  title: string,
  takenAtLocal: string,
  nPhotos: number,
  points: { lat: number; lng: number }[] = [{ lat: 1, lng: 2 }],
) {
  const id = await createDraft(db);
  for (let i = 0; i < nPhotos; i++) await readyPhoto(id);
  const post = (await getPostForEdit(db, id))!;
  await savePostFields(db, id, {
    title,
    description: "",
    placeName: "Somewhere",
    points,
    takenAtLocal,
    utcOffset: null,
    headlinePhotoId: post.headlinePhotoId,
    photoOrder: post.photos.map((p) => p.id),
  });
  const res = await setPublished(db, id, true, NOW);
  if (!res.ok) throw new Error(res.errors.join(", "));
  return id;
}

test("feed: published only, newest first, cursor pages", async () => {
  await makePublished("A", "2026-10-18T10:00:00", 1);
  await makePublished("C", "2026-10-24T10:00:00", 2);
  await makePublished("B", "2026-10-21T10:00:00", 1);
  await createDraft(db);
  const p1 = await listFeedPage(db, { limit: 2 });
  expect(p1.posts.map((p) => p.title)).toEqual(["C", "B"]);
  const p2 = await listFeedPage(db, { limit: 2, cursor: p1.nextCursor! });
  expect(p2.posts.map((p) => p.title)).toEqual(["A"]);
  expect(p2.nextCursor).toBeNull();
});

test("feed: throughId loads down to that post", async () => {
  const ids: string[] = [];
  for (const d of ["10", "11", "12", "13", "14"]) ids.push(await makePublished(`P${d}`, `2026-10-${d}T10:00:00`, 1));
  const page = await listFeedPage(db, { limit: 2, throughId: ids[0] });
  expect(page.posts.map((p) => p.title)).toEqual(["P14", "P13", "P12", "P11", "P10"]);
  expect(page.nextCursor).toBeNull();
  const partial = await listFeedPage(db, { limit: 2, throughId: ids[2] });
  expect(partial.posts.map((p) => p.title)).toEqual(["P14", "P13", "P12"]);
  expect((await listFeedPage(db, { limit: 2, cursor: partial.nextCursor! })).posts.map((p) => p.title)).toEqual(["P11", "P10"]);
});

test("feed: headline excluded from photos list, ISO wall clock, photo urls", async () => {
  await makePublished("Three", "2026-10-24T10:00:00", 3);
  const [post] = (await listFeedPage(db, { limit: 8 })).posts;
  expect(post.photos).toHaveLength(2);
  expect(post.photos.map((p) => p.id)).not.toContain(post.headline.id);
  expect(post.takenAtLocal).toBe("2026-10-24T10:00:00");
  expect(post.headline.displayUrl).toBe(`/photos/${post.headline.id}/display`);
  expect(post.headline.thumbUrl).toBe(`/photos/${post.headline.id}/thumb`);
});

test("empty feed → no posts, null cursor; empty route", async () => {
  expect(await listFeedPage(db, { limit: 8 })).toEqual({ posts: [], nextCursor: null });
  expect(await listRoutePoints(db)).toEqual([]);
});

test("route points oldest first with date labels", async () => {
  await makePublished("C", "2026-10-24T10:00:00", 1);
  const a = await makePublished("A", "2026-10-18T10:00:00", 1, [{ lat: -36.85, lng: 174.76 }]);
  await makePublished("B", "2026-10-21T10:00:00", 1);
  const route = await listRoutePoints(db);
  expect(route.map((r) => r.title)).toEqual(["A", "B", "C"]);
  expect(route[0]).toEqual({ postId: a, title: "A", dateLabel: "Sun 18 Oct", lat: -36.85, lng: 174.76 });
});

test("a travel day contributes every point, in order, between its neighbours", async () => {
  await makePublished("Before", "2026-10-14T10:00:00", 1, [{ lat: 59.33, lng: 18.07 }]);
  const day = await makePublished("Travel day", "2026-10-15T10:00:00", 1, [
    { lat: 59.65, lng: 17.92 },
    { lat: 51.47, lng: -0.45 },
    { lat: 33.94, lng: -118.41 },
  ]);
  await makePublished("After", "2026-10-16T10:00:00", 1, [{ lat: 34.05, lng: -118.24 }]);
  const route = await listRoutePoints(db);
  expect(route.map((r) => [r.title, r.lat])).toEqual([
    ["Before", 59.33],
    ["Travel day", 59.65],
    ["Travel day", 51.47],
    ["Travel day", 33.94],
    ["After", 34.05],
  ]);
  expect(route.filter((r) => r.postId === day)).toHaveLength(3);
});

test("saving replaces a post's points; publishing needs at least one", async () => {
  const id = await makePublished("Trip", "2026-10-15T10:00:00", 1, [
    { lat: 1, lng: 1 },
    { lat: 2, lng: 2 },
    { lat: 3, lng: 3 },
  ]);
  expect((await getPostForEdit(db, id))!.points).toEqual([
    { lat: 1, lng: 1 },
    { lat: 2, lng: 2 },
    { lat: 3, lng: 3 },
  ]);
  const post = (await getPostForEdit(db, id))!;
  const fields = {
    title: post.title,
    description: post.description,
    placeName: post.placeName,
    takenAtLocal: post.takenAtLocal,
    utcOffset: post.utcOffset,
    headlinePhotoId: post.headlinePhotoId,
  };
  await savePostFields(db, id, { ...fields, points: [{ lat: 2, lng: 2 }], photoOrder: post.photos.map((p) => p.id) });
  expect((await getPostForEdit(db, id))!.points).toEqual([{ lat: 2, lng: 2 }]);
  await savePostFields(db, id, { ...fields, points: [], photoOrder: post.photos.map((p) => p.id) });
  await setPublished(db, id, false, NOW);
  expect(await setPublished(db, id, true, NOW)).toEqual({ ok: false, errors: ["Set a location"] });
});

test("publish validation lists every missing field", async () => {
  const id = await createDraft(db);
  expect(await setPublished(db, id, true, NOW)).toEqual({
    ok: false,
    errors: ["Add a title", "Choose a headline photo", "Set a location", "Set a date"],
  });
});

test("complete: first ready photo becomes headline; oversize display rejected and cleaned up", async () => {
  const postId = await createDraft(db);
  const first = await readyPhoto(postId);
  expect((await getPostForEdit(db, postId))!.headlinePhotoId).toBe(first.id);
  await readyPhoto(postId);
  expect((await getPostForEdit(db, postId))!.headlinePhotoId).toBe(first.id);

  const big = await uploadPhoto(postId, { displayBytes: 16 * 1024 * 1024 });
  const res = await completePhoto(db, storage, big.photoId);
  expect(res.ok).toBe(false);
  expect(await db.select().from(photos).where(eq(photos.id, big.photoId))).toHaveLength(0);
  expect(await storage.head(big.displayKey)).toBeNull();
});

test("complete: wrong content type rejected", async () => {
  const postId = await createDraft(db);
  const p = await uploadPhoto(postId, { contentType: "image/png" });
  const res = await completePhoto(db, storage, p.photoId);
  expect(res).toEqual({ ok: false, reason: "Wrong file type" });
});

test("removePhoto moves headline to next photo", async () => {
  const postId = await createDraft(db);
  const a = await readyPhoto(postId);
  const b = await readyPhoto(postId);
  await removePhoto(db, storage, a.id);
  expect((await getPostForEdit(db, postId))!.headlinePhotoId).toBe(b.id);
  await removePhoto(db, storage, b.id);
  expect((await getPostForEdit(db, postId))!.headlinePhotoId).toBeNull();
});

test("deletePost removes storage objects", async () => {
  const postId = await createDraft(db);
  const p = await uploadPhoto(postId);
  await completePhoto(db, storage, p.photoId);
  await deletePost(db, storage, postId);
  expect(await storage.head(p.displayKey)).toBeNull();
  expect(await storage.head(p.thumbKey)).toBeNull();
  expect(await db.select().from(posts).where(eq(posts.id, postId))).toHaveLength(0);
});

test("cleanupStalePhotos removes pending older than 24h only", async () => {
  const postId = await createDraft(db);
  const old = await uploadPhoto(postId);
  const fresh = await uploadPhoto(postId);
  const readyOld = await readyPhoto(postId);
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
  await db.update(photos).set({ createdAt: hoursAgo(25) }).where(eq(photos.id, old.photoId));
  await db.update(photos).set({ createdAt: hoursAgo(1) }).where(eq(photos.id, fresh.photoId));
  await db.update(photos).set({ createdAt: hoursAgo(48) }).where(eq(photos.id, readyOld.id));
  expect(await cleanupStalePhotos(db, storage, NOW)).toBe(1);
  const left = (await db.select({ id: photos.id }).from(photos)).map((r) => r.id).sort();
  expect(left).toEqual([fresh.photoId, readyOld.id].sort());
  expect(await storage.head(old.displayKey)).toBeNull();
});

test("savePostFields reorders photos; admin list shows drafts first then newest", async () => {
  const postId = await createDraft(db);
  const a = await readyPhoto(postId);
  const b = await readyPhoto(postId);
  await savePostFields(db, postId, {
    title: "T", description: "d", placeName: "", points: [], takenAtLocal: null, utcOffset: null,
    headlinePhotoId: b.id, photoOrder: [b.id, a.id],
  });
  const post = (await getPostForEdit(db, postId))!;
  expect(post.photos.map((p) => p.id)).toEqual([b.id, a.id]);
  expect(post.headlinePhotoId).toBe(b.id);
  await makePublished("Pub", "2026-10-20T10:00:00", 1);
  expect((await listAdminPosts(db)).map((r) => [r.title, r.status, r.photoCount])).toEqual([
    ["T", "draft", 2],
    ["Pub", "published", 1],
  ]);
});
