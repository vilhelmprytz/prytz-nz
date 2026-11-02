import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { completePhoto, createDraft, createPendingPhoto, getPostForEdit, savePostFields, setPublished } from "../src/posts/repo";
import { createFsStorage } from "../src/storage/fs";
import { E2E_ENV } from "./env";

// A valid 1×1 WebP; layout uses the stored width/height, so the pixel size doesn't matter.
const WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

export type SeedItem = "photo" | { clip: Buffer; durationMs: number };

export function openSeedDb() {
  const client = postgres(E2E_ENV.DATABASE_URL, { max: 1 });
  return {
    db: drizzle(client, { schema }),
    storage: createFsStorage(E2E_ENV.FS_STORAGE_DIR),
    close: () => client.end(),
  };
}

/** A post with photos and clips in the given order, saved through the app's own repository. */
export async function seedPost(
  { db, storage }: Pick<ReturnType<typeof openSeedDb>, "db" | "storage">,
  opts: {
    title: string;
    date: string;
    points: { lat: number; lng: number }[];
    items: SeedItem[];
    description?: string;
    publish?: boolean;
  },
): Promise<{ id: string; itemIds: string[] }> {
  const id = await createDraft(db);
  const itemIds: string[] = [];
  for (const item of opts.items) {
    const common = { takenAtLocal: null, utcOffset: null, lat: null, lng: null, width: 1500, height: 1000, contentType: "image/webp" as const };
    const p = await createPendingPhoto(
      db,
      id,
      item === "photo"
        ? { ...common, kind: "photo" }
        : { ...common, kind: "video", durationMs: item.durationMs, videoContentType: "video/mp4" },
    );
    await storage.put(p.displayKey, WEBP, "image/webp");
    await storage.put(p.thumbKey, WEBP, "image/webp");
    if (item !== "photo") await storage.put(p.videoKey!, item.clip, "video/mp4");
    const done = await completePhoto(db, storage, p.photoId);
    if (!done.ok) throw new Error(done.reason);
    itemIds.push(p.photoId);
  }
  const current = (await getPostForEdit(db, id))!;
  await savePostFields(db, id, {
    title: opts.title,
    description: opts.description ?? `A day in ${opts.title}.`,
    placeName: `${opts.title} place`,
    points: opts.points,
    takenAtLocal: `${opts.date}T12:00:00`,
    utcOffset: null,
    headlinePhotoId: current.headlinePhotoId,
    photoOrder: itemIds,
  });
  if (opts.publish !== false) {
    const res = await setPublished(db, id, true, new Date());
    if (!res.ok) throw new Error(res.errors.join(", "));
  }
  return { id, itemIds };
}
