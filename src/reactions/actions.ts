"use server";

import { headers } from "next/headers";
import { getViewer } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { assertReader } from "@/gate/access";
import { REACTIONS } from "./emoji";
import { listReactions, toggleReaction } from "./repo";
import { summarizeReactions, type ReactionSummary } from "./summary";

export async function toggleReactionAction(
  postId: string,
  emojiIndex: number,
): Promise<{ needsSignIn: true } | { reactions: ReactionSummary[] }> {
  await assertReader();
  const viewer = await getViewer(await headers());
  if (!viewer.user) return { needsSignIn: true };
  const emoji = REACTIONS[emojiIndex];
  if (!emoji) throw new Error("Bad emoji");
  const db = getDb();
  await toggleReaction(db, { postId, userId: viewer.user.id, emoji });
  return { reactions: summarizeReactions(await listReactions(db, [postId]), viewer.user.id) };
}
