import type { Db } from "@/db/client";
import { claimAnnouncement } from "@/posts/repo";
import type { AnnouncedPost } from "./email";
import { addSubscriber } from "./subscribers";

/**
 * Called after a successful publish. Keeps the admin on the list (their copy shows sending works; an unsubscribe
 * sticks), then claims the post. Returns the post only the first time it's published.
 */
export async function announceNewPost(
  db: Db,
  input: { postId: string; adminUserId: string; now: Date },
): Promise<AnnouncedPost | null> {
  await addSubscriber(db, input.adminUserId);
  return claimAnnouncement(db, input.postId, input.now);
}
