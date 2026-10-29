import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "@/auth/viewer";
import { TripLayout } from "@/components/feed/TripLayout";
import { getDb } from "@/db/client";
import { hasGateCookie } from "@/gate/access";
import { FEED_PAGE_SIZE, UUID_RE } from "@/posts/constants";
import { listFeedPage, listRoutePoints } from "@/posts/repo";
import { REACTIONS } from "@/reactions/emoji";
import { withReactions } from "@/reactions/feed";

export default async function Home({ searchParams }: PageProps<"/">) {
  // The proxy already gates this page; check again here so a matcher change can't expose it.
  const [hasGate, viewer] = await Promise.all([hasGateCookie(), getViewer(await headers())]);
  if (!hasGate && !viewer.isAdmin) redirect("/unlock");

  const { post, react } = await searchParams;
  const focusPostId = typeof post === "string" && UUID_RE.test(post) ? post : null;
  const reactIndex = typeof react === "string" ? Number(react) : NaN;
  const pendingReact =
    focusPostId && viewer.user && Number.isInteger(reactIndex) && REACTIONS[reactIndex]
      ? { postId: focusPostId, index: reactIndex }
      : null;

  const db = getDb();
  const [page, route] = await Promise.all([
    listFeedPage(db, { limit: FEED_PAGE_SIZE, throughId: focusPostId ?? undefined }),
    listRoutePoints(db),
  ]);
  return (
    <TripLayout
      initialPage={await withReactions(db, page, viewer.user?.id ?? null)}
      route={route}
      focusPostId={focusPostId}
      signedIn={viewer.user !== null}
      pendingReact={pendingReact}
    />
  );
}
