import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** A fresh in-memory Postgres with every migration applied. Tests only. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

/** A temp copy of the migrations folder whose journal stops before `tagPrefix` (e.g. "0005_"). Tests only. */
export async function migrationsBefore(tagPrefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pz-migrations-"));
  await cp(migrationsFolder, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  journal.entries = journal.entries.filter((e: { tag: string }) => e.tag < tagPrefix);
  await writeFile(journalPath, JSON.stringify(journal));
  return dir;
}

export { migrationsFolder };
