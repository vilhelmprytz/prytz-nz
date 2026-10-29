import type { Db } from "@/db/client";
import type { FeedItemPage, FeedPage } from "@/posts/types";
import { listReactions } from "./repo";
import { summarizeReactions } from "./summary";

export async function withReactions(db: Db, page: FeedPage, viewerId: string | null): Promise<FeedItemPage> {
  const rows = await listReactions(
    db,
    page.posts.map((p) => p.id),
  );
  return {
    nextCursor: page.nextCursor,
    posts: page.posts.map((post) =>
      Object.assign({}, post, {
        reactions: summarizeReactions(
          rows.filter((r) => r.postId === post.id),
          viewerId,
        ),
      }),
    ),
  };
}
