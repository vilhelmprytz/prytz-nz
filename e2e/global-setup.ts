import { rm } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { E2E_ENV } from "./env";

export async function resetDatabase(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  } finally {
    await client.end();
  }
}

/** Fresh database and storage for every run; content is seeded by e2e/seed.setup.ts after the empty-state test. */
export default async function globalSetup() {
  await resetDatabase(E2E_ENV.DATABASE_URL);
  await rm(E2E_ENV.FS_STORAGE_DIR, { recursive: true, force: true });
}
