import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { postEmailSubscribers, posts, user } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { listReactions, toggleReaction } from "./repo";

let db: Db;
let postId: string;
let draftId: string;
const userId = "user-1";

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: userId, name: "Mum Prytz", email: "mum@example.com", emailVerified: true });
  [{ id: postId }] = await db.insert(posts).values({ status: "published", title: "P" }).returning({ id: posts.id });
  [{ id: draftId }] = await db.insert(posts).values({ status: "draft" }).returning({ id: posts.id });
});

test("toggle adds then removes", async () => {
  expect(await toggleReaction(db, { postId, userId, emoji: "❤️" })).toBe("added");
  expect(await listReactions(db, [postId])).toMatchObject([{ postId, emoji: "❤️", userId, name: "Mum Prytz" }]);
  expect(await toggleReaction(db, { postId, userId, emoji: "❤️" })).toBe("removed");
  expect(await listReactions(db, [postId])).toEqual([]);
});

test("draft post → Not found; unknown emoji → Bad emoji", async () => {
  await expect(toggleReaction(db, { postId: draftId, userId, emoji: "❤️" })).rejects.toThrow("Not found");
  await expect(toggleReaction(db, { postId, userId, emoji: "💩" as never })).rejects.toThrow("Bad emoji");
});

test("listReactions with no posts → []", async () => {
  expect(await listReactions(db, [])).toEqual([]);
});

test("reacting puts the person on the email list; taking it back keeps them there", async () => {
  await toggleReaction(db, { postId, userId, emoji: "❤️" });
  await toggleReaction(db, { postId, userId, emoji: "❤️" });
  expect(await db.select().from(postEmailSubscribers)).toMatchObject([{ userId, unsubscribedAt: null }]);
});

test("a rejected reaction (draft post) adds nobody", async () => {
  await expect(toggleReaction(db, { postId: draftId, userId, emoji: "❤️" })).rejects.toThrow("Not found");
  expect(await db.select().from(postEmailSubscribers)).toEqual([]);
});
