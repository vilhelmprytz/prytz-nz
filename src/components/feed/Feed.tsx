"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { FeedPage, FeedPost } from "@/posts/types";
import { Lightbox } from "./Lightbox";
import { PostCard } from "./PostCard";
import styles from "./feed.module.css";

export type FeedHandle = {
  /** Loads older pages until the post is in the feed, then scrolls to it. */
  showPost(id: string): Promise<void>;
};

async function fetchPage(params: Record<string, string>): Promise<FeedPage> {
  const res = await fetch(`/api/feed?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`Feed request failed (${res.status})`);
  return res.json();
}

export function Feed({
  ref,
  initialPage,
  focusPostId,
  activeId,
  onActiveChange,
  header,
  renderExtras,
}: {
  ref?: Ref<FeedHandle>;
  initialPage: FeedPage;
  focusPostId: string | null;
  activeId: string | null;
  onActiveChange: (id: string) => void;
  header: React.ReactNode;
  renderExtras?: (post: FeedPost) => React.ReactNode;
}) {
  const [posts, setPosts] = useState(initialPage.posts);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [viewer, setViewer] = useState<{ postIndex: number; photoIndex: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  const onActiveRef = useRef(onActiveChange);

  useEffect(() => {
    onActiveRef.current = onActiveChange;
  });

  const append = useCallback((page: FeedPage) => {
    setPosts((list) => {
      const seen = new Set(list.map((p) => p.id));
      return [...list, ...page.posts.filter((p) => !seen.has(p.id))];
    });
    setCursor(page.nextCursor);
  }, []);

  const loadMore = useCallback(async () => {
    if (loading.current || !cursor) return;
    loading.current = true;
    try {
      append(await fetchPage({ cursor }));
    } finally {
      loading.current = false;
    }
  }, [cursor, append]);

  const scrollTo = (id: string, behavior: ScrollBehavior) =>
    document.getElementById(`post-${id}`)?.scrollIntoView({ behavior, block: "start" });

  useImperativeHandle(
    ref,
    () => ({
      async showPost(id: string) {
        if (!posts.some((p) => p.id === id) && cursor) {
          append(await fetchPage({ cursor, through: id }));
          // Let React render the new posts before scrolling.
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        scrollTo(id, "smooth");
      },
    }),
    [posts, cursor, append],
  );

  // Deep link: start at the requested post.
  useEffect(() => {
    if (focusPostId) scrollTo(focusPostId, "instant");
  }, [focusPostId]);

  // Older posts load as the reader nears the end.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && void loadMore(), {
      root: scroller.current,
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  // The post in the middle band of the viewport is the active one (it drives the map).
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.postId;
          if (e.isIntersecting && id) onActiveRef.current(id);
        }
      },
      { root, rootMargin: "-35% 0px -55% 0px" },
    );
    root.querySelectorAll("article[data-post-id]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [posts]);

  const open = viewer ? posts[viewer.postIndex] : null;

  return (
    <div ref={scroller} className={styles.feed}>
      <div className={styles.inner}>
        {header}
        {posts.length === 0 ? (
          <p className={styles.empty}>No posts yet. Check back soon.</p>
        ) : (
          posts.map((post, postIndex) => (
            <PostCard
              key={post.id}
              post={post}
              active={post.id === activeId}
              onOpenPhoto={(photoIndex) => setViewer({ postIndex, photoIndex })}
            >
              {renderExtras?.(post)}
            </PostCard>
          ))
        )}
        <div ref={sentinel} />
      </div>
      {open && viewer && (
        <Lightbox
          photos={[open.headline, ...open.photos]}
          index={viewer.photoIndex}
          title={open.title}
          onIndexChange={(photoIndex) => setViewer({ ...viewer, photoIndex })}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
