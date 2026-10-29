"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useMapHidden } from "@/components/map/use-map-hidden";
import type { FeedItemPage, RoutePoint } from "@/posts/types";
import { Feed, type FeedHandle } from "./Feed";
import { ReactionRow } from "./ReactionRow";
import styles from "./feed.module.css";

const TripMap = dynamic(() => import("@/components/map/TripMap"), { ssr: false });

export function TripLayout({
  initialPage,
  route,
  focusPostId,
  signedIn,
  pendingReact,
}: {
  initialPage: FeedItemPage;
  route: RoutePoint[];
  focusPostId: string | null;
  signedIn: boolean;
  pendingReact: { postId: string; index: number } | null;
}) {
  const [activeId, setActiveId] = useState<string | null>(focusPostId ?? initialPage.posts[0]?.id ?? null);
  const [mapHidden, setMapHidden] = useMapHidden();
  const feed = useRef<FeedHandle>(null);

  function selectFromMap(id: string) {
    setActiveId(id);
    void feed.current?.showPost(id);
  }

  return (
    <div className={styles.app} data-map-hidden={mapHidden}>
      <Feed
        ref={feed}
        initialPage={initialPage}
        focusPostId={focusPostId}
        activeId={activeId}
        onActiveChange={setActiveId}
        renderExtras={(post) => (
          <ReactionRow
            postId={post.id}
            initial={post.reactions}
            signedIn={signedIn}
            pendingReact={pendingReact?.postId === post.id ? pendingReact.index : undefined}
          />
        )}
        header={
          <header className={styles.top}>
            <div>
              <h1 className={styles.brand}>Vilhelm&apos;s trip</h1>
              <p className={styles.subtitle}>Around the globe · 2026</p>
            </div>
            {!mapHidden && (
              <button type="button" className={styles.mapToggle} onClick={() => setMapHidden(true)}>
                Hide map
              </button>
            )}
          </header>
        }
      />
      <aside className={styles.mapSlot} data-testid="trip-map" aria-label="Trip map">
        {!mapHidden && (
          <TripMap points={route} activeId={activeId} onSelect={selectFromMap} onHide={() => setMapHidden(true)} />
        )}
      </aside>
      {mapHidden && (
        <button type="button" className={styles.showMap} onClick={() => setMapHidden(false)}>
          Show map
        </button>
      )}
    </div>
  );
}
