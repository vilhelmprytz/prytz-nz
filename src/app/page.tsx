import { redirect } from "next/navigation";
import { TripLayout } from "@/components/feed/TripLayout";
import { getDb } from "@/db/client";
import { readerAccess } from "@/gate/access";
import { FEED_PAGE_SIZE, UUID_RE } from "@/posts/constants";
import { listFeedPage, listRoutePoints } from "@/posts/repo";

export default async function Home({ searchParams }: PageProps<"/">) {
  // The proxy already gates this page; check again here so a matcher change can't expose it.
  const access = await readerAccess();
  if (!access.hasGate && !access.isAdmin) redirect("/unlock");

  const { post } = await searchParams;
  const focusPostId = typeof post === "string" && UUID_RE.test(post) ? post : null;
  const db = getDb();
  const [page, route] = await Promise.all([
    listFeedPage(db, { limit: FEED_PAGE_SIZE, throughId: focusPostId ?? undefined }),
    listRoutePoints(db),
  ]);
  return <TripLayout initialPage={page} route={route} focusPostId={focusPostId} />;
}
