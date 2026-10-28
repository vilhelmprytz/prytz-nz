import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { isLockedOut, recordAttempt } from "./rate-limit";

const T0 = Date.UTC(2026, 9, 27, 12);
const at = (min: number) => new Date(T0 + min * 60_000);
let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

test("locks on the 5th failure for 15 minutes from that failure", async () => {
  for (const m of [0, 1, 2, 3]) await recordAttempt(db, "a", false, at(m));
  expect(await isLockedOut(db, "a", at(4))).toBe(false);
  await recordAttempt(db, "a", false, at(4));
  expect(await isLockedOut(db, "a", at(18.9))).toBe(true);
  expect(await isLockedOut(db, "a", at(19.1))).toBe(false);
});

test("spread-out failures: lock runs 15 min from the failure that completed 5-in-15", async () => {
  for (const m of [0, 1, 2, 3, 14]) await recordAttempt(db, "a", false, at(m));
  expect(await isLockedOut(db, "a", at(28.9))).toBe(true);
  expect(await isLockedOut(db, "a", at(29.1))).toBe(false);
});

test("a success clears earlier failures", async () => {
  for (const m of [0, 1, 2, 3]) await recordAttempt(db, "a", false, at(m));
  await recordAttempt(db, "a", true, at(4));
  await recordAttempt(db, "a", false, at(5));
  expect(await isLockedOut(db, "a", at(6))).toBe(false);
});

test("other keys unaffected", async () => {
  for (const m of [0, 1, 2, 3, 4]) await recordAttempt(db, "a", false, at(m));
  expect(await isLockedOut(db, "b", at(5))).toBe(false);
});
