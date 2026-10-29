import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { completePhoto, createDraft, createPendingPhoto, getPostForEdit, savePostFields, setPublished } from "../src/posts/repo";
import { createFsStorage } from "../src/storage/fs";
import { E2E_ENV, SEED_FILE } from "./env";
import type { SeedIds } from "./seed";

// A valid 1×1 WebP; layout uses the stored width/height, so the pixel size doesn't matter.
const WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

setup("seed journal content", async () => {
  const client = postgres(E2E_ENV.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });
  const storage = createFsStorage(E2E_ENV.FS_STORAGE_DIR);

  async function post(opts: {
    title: string;
    date: string;
    lat: number;
    lng: number;
    photos: number;
    description?: string;
    publish?: boolean;
  }) {
    const id = await createDraft(db);
    const photoIds: string[] = [];
    for (let i = 0; i < opts.photos; i++) {
      const p = await createPendingPhoto(db, id, {
        takenAtLocal: null,
        utcOffset: null,
        lat: null,
        lng: null,
        width: 1500,
        height: 1000,
        contentType: "image/webp",
      });
      await storage.put(p.displayKey, WEBP, "image/webp");
      await storage.put(p.thumbKey, WEBP, "image/webp");
      const done = await completePhoto(db, storage, p.photoId);
      if (!done.ok) throw new Error(done.reason);
      photoIds.push(p.photoId);
    }
    const current = (await getPostForEdit(db, id))!;
    await savePostFields(db, id, {
      title: opts.title,
      description: opts.description ?? `A day in ${opts.title}.`,
      placeName: `${opts.title} place`,
      lat: opts.lat,
      lng: opts.lng,
      takenAtLocal: `${opts.date}T12:00:00`,
      utcOffset: null,
      headlinePhotoId: current.headlinePhotoId,
      photoOrder: photoIds,
    });
    if (opts.publish !== false) {
      const res = await setPublished(db, id, true, new Date());
      if (!res.ok) throw new Error(res.errors.join(", "));
    }
    return { id, photoIds };
  }

  const ids: SeedIds = {
    stockholm: (await post({ title: "Leaving Stockholm", date: "2026-10-15", lat: 59.33, lng: 18.07, photos: 1 })).id,
    landed: (await post({ title: "Landed!", date: "2026-10-18", lat: 34.05, lng: -118.24, photos: 1 })).id,
    museum: (
      await post({ title: "Museum X", date: "2026-10-24", lat: 37.77, lng: -122.47, photos: 8, description: "Line one\nLine two" })
    ).id,
    auckland: (await post({ title: "Auckland", date: "2026-11-01", lat: -36.85, lng: 174.76, photos: 2 })).id,
    ...(await (async () => {
      const draft = await post({ title: "Secret draft", date: "2026-11-03", lat: 1, lng: 1, photos: 1, publish: false });
      return { draft: draft.id, draftPhoto: draft.photoIds[0] };
    })()),
  };
  await mkdir(path.dirname(SEED_FILE), { recursive: true });
  await writeFile(SEED_FILE, JSON.stringify(ids));
  await client.end();
});
