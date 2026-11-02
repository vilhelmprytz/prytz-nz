import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { SEED_FILE } from "./env";
import { makeClip } from "./fixtures";
import type { SeedIds } from "./seed";
import { openSeedDb, seedPost, type SeedItem } from "./seed-helpers";

const photos = (n: number): SeedItem[] => Array.from({ length: n }, () => "photo");

setup("seed journal content", async ({ page }) => {
  const seed = openSeedDb();
  const clip = await makeClip(page, { seconds: 2, width: 640, height: 360 });
  const post = (opts: Parameters<typeof seedPost>[1]) => seedPost(seed, opts);

  const draft = await post({ title: "Secret draft", date: "2026-11-03", points: [{ lat: 1, lng: 1 }], items: photos(1), publish: false });
  const ids: SeedIds = {
    stockholm: (await post({ title: "Leaving Stockholm", date: "2026-10-15", points: [{ lat: 59.33, lng: 18.07 }], items: photos(1) })).id,
    landed: (
      await post({
        title: "Landed!",
        date: "2026-10-18",
        // A travel day: ARN → LHR → LAX
        points: [
          { lat: 59.65, lng: 17.92 },
          { lat: 51.47, lng: -0.45 },
          { lat: 33.94, lng: -118.41 },
        ],
        items: photos(1),
      })
    ).id,
    museum: (
      await post({ title: "Museum X", date: "2026-10-24", points: [{ lat: 37.77, lng: -122.47 }], items: photos(8), description: "Line one\nLine two" })
    ).id,
    // Two photos and a 2-second clip.
    auckland: (
      await post({ title: "Auckland", date: "2026-11-01", points: [{ lat: -36.85, lng: 174.76 }], items: [...photos(2), { clip, durationMs: 2000 }] })
    ).id,
    draft: draft.id,
    draftPhoto: draft.itemIds[0],
  };
  await mkdir(path.dirname(SEED_FILE), { recursive: true });
  await writeFile(SEED_FILE, JSON.stringify(ids));
  await seed.close();
});
