"use client";
/* eslint-disable @next/next/no-img-element -- photos come from our own gated /photos route, already resized */
import { useState } from "react";
import { formatDuration, formatPostDate } from "@/posts/format";
import type { FeedPost } from "@/posts/types";
import styles from "./feed.module.css";

const VISIBLE_THUMBS = 5;

export function PostCard({
  post,
  active,
  onOpenPhoto,
  children,
}: {
  post: FeedPost;
  active: boolean;
  onOpenPhoto: (index: number) => void;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = post.photos.length > VISIBLE_THUMBS;
  const thumbs = expanded ? post.photos : post.photos.slice(0, VISIBLE_THUMBS);
  // Folded, the fifth tile stands in for everything not shown: "+N" counts the photos beyond the first four.
  const hidden = collapsible && !expanded ? post.photos.length - (VISIBLE_THUMBS - 1) : 0;
  const total = post.photos.length + 1;

  return (
    <article id={`post-${post.id}`} data-post-id={post.id} className={active ? styles.postActive : styles.post}>
      <div className={styles.meta}>
        <span className={styles.dot} />
        <span>{formatPostDate(post.takenAtLocal, "sv")}</span>
        {post.placeName && (
          <>
            <span>·</span>
            <span className={styles.place}>{post.placeName}</span>
          </>
        )}
      </div>
      <h2 className={styles.title}>{post.title}</h2>
      <figure className={styles.hero} onClick={() => onOpenPhoto(0)}>
        <img
          src={post.headline.displayUrl}
          width={post.headline.width}
          height={post.headline.height}
          alt={post.title}
          loading="lazy"
        />
      </figure>
      {post.description && <p className={styles.desc}>{post.description}</p>}
      {thumbs.length > 0 && (
        <div className={styles.gallery} data-testid="gallery">
          {thumbs.map((photo, i) => {
            const isMore = hidden > 0 && i === VISIBLE_THUMBS - 1;
            const isClip = photo.kind === "video";
            return (
              <button
                key={photo.id}
                type="button"
                className={styles.thumb}
                // "+N" opens the whole set in place; any other photo opens big.
                onClick={() => (isMore ? setExpanded(true) : onOpenPhoto(i + 1))}
                aria-label={isMore ? `Visa alla ${total} bilder` : `${isClip ? "Video" : "Bild"} ${i + 2}`}
                aria-expanded={isMore ? false : undefined}
              >
                <img src={photo.thumbUrl} alt="" loading="lazy" />
                {isClip && !isMore && (
                  <span className={styles.clipBadge} aria-hidden="true">
                    <span>▶</span>
                    <span>{formatDuration(photo.durationMs ?? 0)}</span>
                  </span>
                )}
                {isMore && <span className={styles.more}>+{hidden}</span>}
              </button>
            );
          })}
        </div>
      )}
      {collapsible && expanded && (
        <button type="button" className={styles.showFewer} aria-expanded onClick={() => setExpanded(false)}>
          Visa färre
        </button>
      )}
      {children}
    </article>
  );
}
