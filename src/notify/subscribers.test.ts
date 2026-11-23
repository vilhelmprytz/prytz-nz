import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { postEmailSubscribers, user } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { addSubscriber, getSubscription, listRecipients, setSubscribed } from "./subscribers";

let db: Db;
const NOW = new Date("2026-11-23T12:00:00Z");

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(user).values([
    { id: "a", name: "Anna Svensson", email: "a@example.com", emailVerified: true },
    { id: "b", name: "Bertil", email: "b@example.com", emailVerified: true },
    { id: "c", name: "Cecilia", email: "c@example.com", emailVerified: false },
  ]);
});

async function tokenOf(userId: string): Promise<string> {
  const [row] = await db.select().from(postEmailSubscribers).where(eq(postEmailSubscribers.userId, userId));
  return row.unsubscribeToken;
}

test("adding twice keeps one row and the same token", async () => {
  await addSubscriber(db, "a");
  const token = await tokenOf("a");
  await addSubscriber(db, "a");
  const rows = await db.select().from(postEmailSubscribers);
  expect(rows).toHaveLength(1);
  expect(rows[0].unsubscribeToken).toBe(token);
});

test("recipients: verified and subscribed only", async () => {
  for (const id of ["a", "b", "c"]) await addSubscriber(db, id);
  await setSubscribed(db, await tokenOf("b"), false, NOW);
  const recipients = await listRecipients(db);
  expect(recipients.map((r) => r.userId)).toEqual(["a"]);
  expect(recipients[0]).toEqual({
    userId: "a",
    email: "a@example.com",
    name: "Anna Svensson",
    unsubscribeToken: await tokenOf("a"),
  });
});

test("unsubscribe sticks when the person is added again; undo resubscribes", async () => {
  await addSubscriber(db, "a");
  const token = await tokenOf("a");
  expect(await getSubscription(db, token)).toEqual({ subscribed: true });
  expect(await setSubscribed(db, token, false, NOW)).toBe(true);
  expect(await getSubscription(db, token)).toEqual({ subscribed: false });
  await addSubscriber(db, "a");
  expect(await getSubscription(db, token)).toEqual({ subscribed: false });
  expect(await setSubscribed(db, token, true, NOW)).toBe(true);
  expect(await getSubscription(db, token)).toEqual({ subscribed: true });
  expect((await listRecipients(db)).map((r) => r.userId)).toEqual(["a"]);
});

test("unknown token: getSubscription → null, setSubscribed → false", async () => {
  const unknown = "0".repeat(64);
  expect(await getSubscription(db, unknown)).toBeNull();
  expect(await setSubscribed(db, unknown, false, NOW)).toBe(false);
});
