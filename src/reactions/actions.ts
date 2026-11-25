"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { getViewer } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { getEnv } from "@/env";
import { assertReader } from "@/gate/access";
import { noticeDepsFromEnv, sendReactionNotice } from "@/notify/admin-notices";
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
  const result = await toggleReaction(db, { postId, userId: viewer.user.id, emoji });
  // One email to the admin per added reaction (not their own), after the response so reacting stays instant.
  if (result === "added" && !viewer.isAdmin) {
    const reactor = viewer.user;
    after(() => sendReactionNotice({ db, ...noticeDepsFromEnv(getEnv()) }, { postId, emoji, reactor }));
  }
  return { reactions: summarizeReactions(await listReactions(db, [postId]), viewer.user.id) };
}
