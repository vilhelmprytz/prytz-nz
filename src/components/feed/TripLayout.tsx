"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useMapHidden } from "@/components/map/use-map-hidden";
import type { FeedPage, RoutePoint } from "@/posts/types";
import { Feed, type FeedHandle } from "./Feed";
import styles from "./feed.module.css";

const TripMap = dynamic(() => import("@/components/map/TripMap"), { ssr: false });

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
        header={
          <header className={styles.top}>
            <div className={styles.brand}>
              Vilhelm&apos;s trip
              <small>Around the globe · 2026</small>
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
