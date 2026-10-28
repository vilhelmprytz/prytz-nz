import { and, asc, eq, gt, lt, lte, max } from "drizzle-orm";
import type { Db } from "@/db/client";
import { loginAttempts } from "@/db/schema";

export const RATE_LIMIT = { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
const LOOKBACK_MS = RATE_LIMIT.windowMs + RATE_LIMIT.lockMs;
const RETENTION_MS = 24 * 3600_000;

export async function isLockedOut(db: Db, ipKey: string, now: Date): Promise<boolean> {
  const [{ lastSuccess }] = await db
    .select({ lastSuccess: max(loginAttempts.attemptedAt) })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ipKey, ipKey), eq(loginAttempts.success, true), lte(loginAttempts.attemptedAt, now)));
  const lookback = new Date(now.getTime() - LOOKBACK_MS);
  const since = lastSuccess && lastSuccess > lookback ? lastSuccess : lookback;

  const rows = await db
    .select({ at: loginAttempts.attemptedAt })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ipKey, ipKey),
        eq(loginAttempts.success, false),
        gt(loginAttempts.attemptedAt, since),
        lte(loginAttempts.attemptedAt, now),
      ),
    )
    .orderBy(asc(loginAttempts.attemptedAt));

  const failures = rows.map((r) => r.at.getTime());
  const n = RATE_LIMIT.maxFailures;
  let lockedUntil = 0;
  for (let i = n - 1; i < failures.length; i++) {
    if (failures[i] - failures[i - (n - 1)] <= RATE_LIMIT.windowMs) {
      lockedUntil = Math.max(lockedUntil, failures[i] + RATE_LIMIT.lockMs);
    }
  }
  return now.getTime() < lockedUntil;
}

export async function recordAttempt(db: Db, ipKey: string, success: boolean, now: Date): Promise<void> {
  await db.insert(loginAttempts).values({ ipKey, success, attemptedAt: now });
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, new Date(now.getTime() - RETENTION_MS)));
}
