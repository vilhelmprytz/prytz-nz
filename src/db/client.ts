import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { getEnv } from "@/env";
import * as schema from "./schema";

// Shared by postgres-js (app) and PGlite (tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

const globalForDb = globalThis as unknown as { db?: Db };

export function getDb(): Db {
  globalForDb.db ??= drizzle(postgres(getEnv().DATABASE_URL), { schema });
  return globalForDb.db;
}
