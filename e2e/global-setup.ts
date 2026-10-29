import { rm } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { E2E_ENV } from "./env";
import { seed } from "./seed";

export async function resetDatabase(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  await resetDatabase(E2E_ENV.DATABASE_URL);
  await rm(E2E_ENV.FS_STORAGE_DIR, { recursive: true, force: true });
  await seed();
}
