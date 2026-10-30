import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, test } from "vitest";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** A copy of the migrations folder that stops before the multi-point migration (today's production schema). */
async function migrationsBeforePoints(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pz-migrations-"));
  await cp(migrationsFolder, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  journal.entries = journal.entries.filter((e: { tag: string }) => !e.tag.startsWith("0003_"));
  await writeFile(journalPath, JSON.stringify(journal));
  return dir;
}

test("existing posts keep their location as their single point", async () => {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: await migrationsBeforePoints() });
  await client.exec(`
    insert into posts (id, title, lat, lng, status) values
      ('11111111-1111-1111-1111-111111111111', 'Has location', 59.33, 18.07, 'published'),
      ('22222222-2222-2222-2222-222222222222', 'No location yet', null, null, 'draft');
  `);

  await migrate(db, { migrationsFolder });

  const points = await client.query<{ post_id: string; position: number; lat: number; lng: number }>(
    "select post_id, position, lat, lng from post_points order by post_id",
  );
  expect(points.rows).toEqual([{ post_id: "11111111-1111-1111-1111-111111111111", position: 0, lat: 59.33, lng: 18.07 }]);
  const columns = await client.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_name = 'posts' and column_name in ('lat', 'lng')",
  );
  expect(columns.rows).toEqual([]);
  const posts = await client.query<{ title: string }>("select title from posts order by title");
  expect(posts.rows.map((r) => r.title)).toEqual(["Has location", "No location yet"]);
});
