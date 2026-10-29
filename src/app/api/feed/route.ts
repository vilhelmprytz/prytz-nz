import { headers } from "next/headers";
import { getViewer } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { hasGateCookie } from "@/gate/access";
import { FEED_PAGE_SIZE, UUID_RE } from "@/posts/constants";
import { listFeedPage } from "@/posts/repo";
import { withReactions } from "@/reactions/feed";

export async function GET(request: Request) {
  const [hasGate, viewer] = await Promise.all([hasGateCookie(), getViewer(await headers())]);
  if (!hasGate && !viewer.isAdmin) return Response.json({ error: "locked" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const through = params.get("through");
  const db = getDb();
  const page = await listFeedPage(db, {
    limit: FEED_PAGE_SIZE,
    cursor: params.get("cursor") ?? undefined,
    throughId: through && UUID_RE.test(through) ? through : undefined,
  });
  return Response.json(await withReactions(db, page, viewer.user?.id ?? null));
}
