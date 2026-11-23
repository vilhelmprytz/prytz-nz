import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { postEmailSubscribers, posts, user } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { announceNewPost } from "./announce";
import { getSubscription, setSubscribed } from "./subscribers";

let db: Db;
let postId: string;
const NOW = new Date("2026-11-23T12:00:00Z");
const adminUserId = "admin";

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: adminUserId, name: "Vilhelm Prytz", email: "admin@example.com", emailVerified: true });
  [{ id: postId }] = await db
    .insert(posts)
    .values({ title: "Milford Sound", placeName: "Fiordland", status: "published", takenAtLocal: "2026-11-14T10:00:00" })
    .returning({ id: posts.id });
});

async function adminToken(): Promise<string | undefined> {
  const [row] = await db.select().from(postEmailSubscribers).where(eq(postEmailSubscribers.userId, adminUserId));
  return row?.unsubscribeToken;
}

test("publishing puts the admin on the list and claims the post", async () => {
  expect(await adminToken()).toBeUndefined();
  expect(await announceNewPost(db, { postId, adminUserId, now: NOW })).toEqual({
    id: postId,
    title: "Milford Sound",
    placeName: "Fiordland",
    takenAtLocal: "2026-11-14T10:00:00",
  });
  expect(await getSubscription(db, (await adminToken())!)).toEqual({ subscribed: true });
  expect(await announceNewPost(db, { postId, adminUserId, now: NOW })).toBeNull();
});

test("an admin who unsubscribed stays unsubscribed", async () => {
  await announceNewPost(db, { postId, adminUserId, now: NOW });
  const token = (await adminToken())!;
  await setSubscribed(db, token, false, NOW);
  const [{ id: second }] = await db
    .insert(posts)
    .values({ title: "Next", status: "published", takenAtLocal: "2026-11-15T10:00:00" })
    .returning({ id: posts.id });
  expect(await announceNewPost(db, { postId: second, adminUserId, now: NOW })).not.toBeNull();
  expect(await getSubscription(db, token)).toEqual({ subscribed: false });
});
