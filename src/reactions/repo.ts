import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { posts, reactions, user } from "@/db/schema";
import { isReaction, type Reaction } from "./emoji";
import type { ReactionRow } from "./summary";

/** Slack-style: each person can switch each emoji on or off for each published post. */
export async function toggleReaction(
  db: Db,
  input: { postId: string; userId: string; emoji: Reaction },
): Promise<"added" | "removed"> {
  if (!isReaction(input.emoji)) throw new Error("Bad emoji");
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, input.postId), eq(posts.status, "published")));
  if (!post) throw new Error("Not found");

  const removed = await db
    .delete(reactions)
    .where(
      and(eq(reactions.postId, input.postId), eq(reactions.userId, input.userId), eq(reactions.emoji, input.emoji)),
    )
    .returning({ postId: reactions.postId });
  if (removed.length > 0) return "removed";
  await db.insert(reactions).values(input).onConflictDoNothing();
  return "added";
}

export async function listReactions(db: Db, postIds: string[]): Promise<ReactionRow[]> {
  if (postIds.length === 0) return [];
  const rows = await db
    .select({
      postId: reactions.postId,
      emoji: reactions.emoji,
      userId: reactions.userId,
      name: user.name,
      createdAt: reactions.createdAt,
    })
    .from(reactions)
    .innerJoin(user, eq(user.id, reactions.userId))
    .where(inArray(reactions.postId, postIds))
    .orderBy(asc(reactions.createdAt));
  return rows.flatMap((r) => (isReaction(r.emoji) ? [{ ...r, emoji: r.emoji }] : []));
}
