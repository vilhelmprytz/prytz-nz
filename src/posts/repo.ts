import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, lt, max, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { photos, posts } from "@/db/schema";
import type { Storage } from "@/storage/types";
import { formatPostDate } from "./format";
import type {
  AdminPostRow,
  EditablePhoto,
  EditablePost,
  FeedPage,
  FeedPost,
  PhotoView,
  PostFieldsInput,
  RoutePoint,
  UploadMeta,
} from "./types";

export const MAX_DISPLAY_BYTES = 15 * 1024 * 1024;
export const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const STALE_PENDING_MS = 24 * 3600_000;

/** Postgres returns `2026-10-24 10:00:00`; the app speaks `2026-10-24T10:00:00`. */
const isoLocal = (value: string | null) => (value ? value.replace(" ", "T").slice(0, 19) : null);

type PhotoRow = typeof photos.$inferSelect;

const photoView = (p: Pick<PhotoRow, "id" | "width" | "height">): PhotoView => ({
  id: p.id,
  width: p.width,
  height: p.height,
  displayUrl: `/photos/${p.id}/display`,
  thumbUrl: `/photos/${p.id}/thumb`,
});

const editablePhoto = (p: PhotoRow): EditablePhoto => ({
  ...photoView(p),
  takenAtLocal: isoLocal(p.takenAtLocal),
  utcOffset: p.utcOffset,
  lat: p.lat,
  lng: p.lng,
});

const readyPhotosOf = (db: Db, postIds: string[]) =>
  postIds.length === 0
    ? Promise.resolve([] as PhotoRow[])
    : db
        .select()
        .from(photos)
        .where(and(inArray(photos.postId, postIds), eq(photos.status, "ready")))
        .orderBy(asc(photos.sortOrder), asc(photos.createdAt));

// ---------- editing ----------

export async function createDraft(db: Db): Promise<string> {
  const [row] = await db.insert(posts).values({}).returning({ id: posts.id });
  return row.id;
}

export async function getPostForEdit(db: Db, id: string): Promise<EditablePost | null> {
  const [post] = await db.select().from(posts).where(eq(posts.id, id));
  if (!post) return null;
  const rows = await readyPhotosOf(db, [id]);
  return {
    id: post.id,
    title: post.title,
    description: post.description,
    placeName: post.placeName,
    lat: post.lat,
    lng: post.lng,
    takenAtLocal: isoLocal(post.takenAtLocal),
    utcOffset: post.utcOffset,
    status: post.status,
    headlinePhotoId: post.headlinePhotoId,
    photos: rows.map(editablePhoto),
  };
}

export async function savePostFields(db: Db, id: string, input: PostFieldsInput): Promise<void> {
  const owned = new Set((await readyPhotosOf(db, [id])).map((p) => p.id));
  await db
    .update(posts)
    .set({
      title: input.title,
      description: input.description,
      placeName: input.placeName,
      lat: input.lat,
      lng: input.lng,
      takenAtLocal: input.takenAtLocal,
      utcOffset: input.utcOffset,
      headlinePhotoId: input.headlinePhotoId && owned.has(input.headlinePhotoId) ? input.headlinePhotoId : null,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id));
  const order = input.photoOrder.filter((photoId) => owned.has(photoId));
  for (const [i, photoId] of order.entries()) {
    await db.update(photos).set({ sortOrder: i }).where(eq(photos.id, photoId));
  }
}

export function validateForPublish(post: EditablePost): string[] {
  const errors: string[] = [];
  if (!post.title.trim()) errors.push("Add a title");
  if (!post.headlinePhotoId || !post.photos.some((p) => p.id === post.headlinePhotoId)) {
    errors.push("Choose a headline photo");
  }
  if (post.lat === null || post.lng === null) errors.push("Set a location");
  if (!post.takenAtLocal) errors.push("Set a date");
  return errors;
}

export async function setPublished(
  db: Db,
  id: string,
  published: boolean,
  now: Date,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const post = await getPostForEdit(db, id);
  if (!post) return { ok: false, errors: ["Post not found"] };
  if (published) {
    const errors = validateForPublish(post);
    if (errors.length > 0) return { ok: false, errors };
  }
  await db
    .update(posts)
    .set({
      status: published ? "published" : "draft",
      publishedAt: published ? sql`coalesce(${posts.publishedAt}, ${now.toISOString()}::timestamptz)` : posts.publishedAt,
      updatedAt: now,
    })
    .where(eq(posts.id, id));
  return { ok: true };
}

export async function deletePost(db: Db, storage: Storage, id: string): Promise<void> {
  const rows = await db.select({ d: photos.displayKey, t: photos.thumbKey }).from(photos).where(eq(photos.postId, id));
  await storage.delete(rows.flatMap((r) => [r.d, r.t]));
  await db.delete(posts).where(eq(posts.id, id));
}

export async function listAdminPosts(db: Db): Promise<AdminPostRow[]> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      status: posts.status,
      takenAtLocal: posts.takenAtLocal,
      photoCount: sql<number>`count(${photos.id}) filter (where ${photos.status} = 'ready')`.mapWith(Number),
    })
    .from(posts)
    .leftJoin(photos, eq(photos.postId, posts.id))
    .groupBy(posts.id)
    .orderBy(sql`${posts.takenAtLocal} desc nulls first`, desc(posts.createdAt));
  return rows.map((r) => ({ ...r, takenAtLocal: isoLocal(r.takenAtLocal) }));
}

// ---------- photos ----------

export async function createPendingPhoto(
  db: Db,
  postId: string,
  meta: UploadMeta,
): Promise<{ photoId: string; displayKey: string; thumbKey: string }> {
  const photoId = randomUUID();
  const ext = meta.contentType === "image/webp" ? "webp" : "jpg";
  const displayKey = `photos/${photoId}/display.${ext}`;
  const thumbKey = `photos/${photoId}/thumb.${ext}`;
  await db.insert(photos).values({
    id: photoId,
    postId,
    displayKey,
    thumbKey,
    contentType: meta.contentType,
    width: meta.width,
    height: meta.height,
    takenAtLocal: meta.takenAtLocal,
    utcOffset: meta.utcOffset,
    lat: meta.lat,
    lng: meta.lng,
  });
  return { photoId, displayKey, thumbKey };
}

async function discardPhoto(db: Db, storage: Storage, photo: PhotoRow): Promise<void> {
  await storage.delete([photo.displayKey, photo.thumbKey]);
  await db.delete(photos).where(eq(photos.id, photo.id));
}

/** Checks the browser's uploads landed intact, then makes the photo part of its post. */
export async function completePhoto(
  db: Db,
  storage: Storage,
  photoId: string,
): Promise<{ ok: true; photo: EditablePhoto } | { ok: false; reason: string }> {
  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId));
  if (!photo || photo.status !== "pending") return { ok: false, reason: "Upload not found" };

  const [display, thumb] = await Promise.all([storage.head(photo.displayKey), storage.head(photo.thumbKey)]);
  const reason = !display || !thumb
    ? "Upload missing"
    : display.contentType !== photo.contentType || thumb.contentType !== photo.contentType
      ? "Wrong file type"
      : display.size > MAX_DISPLAY_BYTES || thumb.size > MAX_THUMB_BYTES
        ? "File too large"
        : null;
  if (reason) {
    await discardPhoto(db, storage, photo);
    return { ok: false, reason };
  }

  const [{ last }] = await db
    .select({ last: max(photos.sortOrder) })
    .from(photos)
    .where(and(eq(photos.postId, photo.postId), eq(photos.status, "ready")));
  const [ready] = await db
    .update(photos)
    .set({ status: "ready", sortOrder: last === null ? 0 : last + 1 })
    .where(eq(photos.id, photoId))
    .returning();
  await db
    .update(posts)
    .set({ headlinePhotoId: sql`coalesce(${posts.headlinePhotoId}, ${photoId}::uuid)`, updatedAt: new Date() })
    .where(eq(posts.id, photo.postId));
  return { ok: true, photo: editablePhoto(ready) };
}

export async function removePhoto(db: Db, storage: Storage, photoId: string): Promise<void> {
  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId));
  if (!photo) return;
  await discardPhoto(db, storage, photo);
  const [post] = await db.select({ headline: posts.headlinePhotoId }).from(posts).where(eq(posts.id, photo.postId));
  if (post?.headline === photoId) {
    const [next] = await readyPhotosOf(db, [photo.postId]);
    await db.update(posts).set({ headlinePhotoId: next?.id ?? null }).where(eq(posts.id, photo.postId));
  }
}

export async function cleanupStalePhotos(db: Db, storage: Storage, now: Date): Promise<number> {
  const stale = await db
    .select()
    .from(photos)
    .where(and(eq(photos.status, "pending"), lt(photos.createdAt, new Date(now.getTime() - STALE_PENDING_MS))));
  for (const photo of stale) await discardPhoto(db, storage, photo);
  return stale.length;
}

// ---------- reading ----------

type CursorKey = [takenAtLocal: string, createdAt: string, id: string];

const encodeCursor = (key: CursorKey) => Buffer.from(JSON.stringify(key)).toString("base64url");

function decodeCursor(cursor: string): CursorKey | null {
  try {
    const key = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return Array.isArray(key) && key.length === 3 && key.every((k) => typeof k === "string") ? (key as CursorKey) : null;
  } catch {
    return null;
  }
}

// Feed order: newest wall-clock first; created_at and id break ties. created_at is read as text so the
// cursor keeps Postgres' microseconds (a JS Date would round them away and skip or repeat rows).
const sortKey = sql`(${posts.takenAtLocal}, ${posts.createdAt}, ${posts.id})`;
const keyTuple = ([t, c, id]: CursorKey) => sql`(${t}::timestamp, ${c}::timestamptz, ${id}::uuid)`;

const feedColumns = {
  id: posts.id,
  title: posts.title,
  description: posts.description,
  placeName: posts.placeName,
  lat: posts.lat,
  lng: posts.lng,
  takenAtLocal: posts.takenAtLocal,
  headlinePhotoId: posts.headlinePhotoId,
  createdAtText: sql<string>`${posts.createdAt}::text`,
};

export async function listFeedPage(
  db: Db,
  opts: { cursor?: string; limit: number; throughId?: string },
): Promise<FeedPage> {
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  const published = eq(posts.status, "published");
  const afterCursor = after ? sql`${sortKey} < ${keyTuple(after)}` : undefined;

  let through: CursorKey | null = null;
  if (opts.throughId) {
    const [target] = await db
      .select(feedColumns)
      .from(posts)
      .where(and(eq(posts.id, opts.throughId), published));
    if (target?.takenAtLocal) through = [target.takenAtLocal, target.createdAtText, target.id];
  }

  const rows = await db
    .select(feedColumns)
    .from(posts)
    .where(and(published, afterCursor, through ? sql`${sortKey} >= ${keyTuple(through)}` : undefined))
    .orderBy(desc(posts.takenAtLocal), desc(posts.createdAt), desc(posts.id))
    .limit(through ? 10_000 : opts.limit + 1);

  let pageRows = rows;
  let hasMore: boolean;
  if (through) {
    const [{ remaining }] = await db
      .select({ remaining: count() })
      .from(posts)
      .where(and(published, sql`${sortKey} < ${keyTuple(through)}`));
    hasMore = remaining > 0;
  } else {
    hasMore = rows.length > opts.limit;
    pageRows = rows.slice(0, opts.limit);
  }

  const photoRows = await readyPhotosOf(
    db,
    pageRows.map((r) => r.id),
  );
  const feedPosts: FeedPost[] = [];
  for (const r of pageRows) {
    const own = photoRows.filter((p) => p.postId === r.id);
    const headline = own.find((p) => p.id === r.headlinePhotoId) ?? own[0];
    if (!headline || r.lat === null || r.lng === null || !r.takenAtLocal) continue;
    feedPosts.push({
      id: r.id,
      title: r.title,
      description: r.description,
      placeName: r.placeName,
      lat: r.lat,
      lng: r.lng,
      takenAtLocal: isoLocal(r.takenAtLocal)!,
      headline: photoView(headline),
      photos: own.filter((p) => p.id !== headline.id).map(photoView),
    });
  }

  const last = pageRows.at(-1);
  return {
    posts: feedPosts,
    nextCursor: hasMore && last?.takenAtLocal ? encodeCursor([last.takenAtLocal, last.createdAtText, last.id]) : null,
  };
}

export async function listRoutePoints(db: Db): Promise<RoutePoint[]> {
  const rows = await db
    .select({ id: posts.id, title: posts.title, lat: posts.lat, lng: posts.lng, takenAtLocal: posts.takenAtLocal })
    .from(posts)
    .where(eq(posts.status, "published"))
    .orderBy(asc(posts.takenAtLocal), asc(posts.createdAt), asc(posts.id));
  return rows.flatMap((r) =>
    r.lat === null || r.lng === null || !r.takenAtLocal
      ? []
      : [{ id: r.id, title: r.title, dateLabel: formatPostDate(isoLocal(r.takenAtLocal)!), lat: r.lat, lng: r.lng }],
  );
}
