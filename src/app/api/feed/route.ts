import { getDb } from "@/db/client";
import { readerAccess } from "@/gate/access";
import { FEED_PAGE_SIZE, UUID_RE } from "@/posts/constants";
import { listFeedPage } from "@/posts/repo";

export async function GET(request: Request) {
  const access = await readerAccess();
  if (!access.hasGate && !access.isAdmin) return Response.json({ error: "locked" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const through = params.get("through");
  const page = await listFeedPage(getDb(), {
    limit: FEED_PAGE_SIZE,
    cursor: params.get("cursor") ?? undefined,
    throughId: through && UUID_RE.test(through) ? through : undefined,
  });
  return Response.json(page);
}
