"use client";

import { useRef, useState } from "react";
import type { FeedPage, RoutePoint } from "@/posts/types";
import { Feed, type FeedHandle } from "./Feed";
import styles from "./feed.module.css";

export function TripLayout({
  initialPage,
  route,
  focusPostId,
}: {
  initialPage: FeedPage;
  route: RoutePoint[];
  focusPostId: string | null;
}) {
  const [activeId, setActiveId] = useState<string | null>(focusPostId ?? initialPage.posts[0]?.id ?? null);
  const feed = useRef<FeedHandle>(null);

  return (
    <div className={styles.app} data-route-points={route.length}>
      <Feed
        ref={feed}
        initialPage={initialPage}
        focusPostId={focusPostId}
        activeId={activeId}
        onActiveChange={setActiveId}
        header={
          <header className={styles.top}>
            <div className={styles.brand}>
              Vilhelm&apos;s trip
              <small>Around the globe · 2026</small>
            </div>
          </header>
        }
      />
      <aside className={styles.mapSlot} />
    </div>
  );
}
