import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, test } from "vitest";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** A copy of the migrations folder that stops before the clips migration (today's production schema). */
async function migrationsBeforeClips(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pz-migrations-"));
  await cp(migrationsFolder, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  journal.entries = journal.entries.filter((e: { tag: string }) => e.tag < "0004_");
  await writeFile(journalPath, JSON.stringify(journal));
  return dir;
}

test("existing photos become kind 'photo' with no video fields", async () => {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: await migrationsBeforeClips() });
  await client.exec(`
    insert into posts (id, title, status) values ('11111111-1111-1111-1111-111111111111', 'Old post', 'published');
    insert into photos (post_id, display_key, thumb_key, content_type, width, height, status)
      values ('11111111-1111-1111-1111-111111111111', 'd', 't', 'image/webp', 4, 3, 'ready');
  `);

  await migrate(db, { migrationsFolder });

  const rows = await client.query("select kind, video_key, duration_ms, video_content_type from photos");
  expect(rows.rows).toEqual([{ kind: "photo", video_key: null, duration_ms: null, video_content_type: null }]);
});
