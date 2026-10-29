/* eslint-disable @next/next/no-img-element -- photos come from our own gated /photos route, already resized */
import { formatPostDate } from "@/posts/format";
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
  const thumbs = post.photos.slice(0, VISIBLE_THUMBS);
  // The fifth tile stands in for everything not shown: "+N" counts the photos beyond the first four.
  const hidden = post.photos.length > VISIBLE_THUMBS ? post.photos.length - (VISIBLE_THUMBS - 1) : 0;

  return (
    <article id={`post-${post.id}`} data-post-id={post.id} className={active ? styles.postActive : styles.post}>
      <div className={styles.meta}>
        <span className={styles.dot} />
        <span>{formatPostDate(post.takenAtLocal)}</span>
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
        <div className={styles.gallery}>
          {thumbs.map((photo, i) => {
            const isMore = hidden > 0 && i === VISIBLE_THUMBS - 1;
            return (
              <button
                key={photo.id}
                type="button"
                className={styles.thumb}
                onClick={() => onOpenPhoto(i + 1)}
                aria-label={isMore ? `${hidden} more photos` : `Photo ${i + 2}`}
              >
                <img src={photo.thumbUrl} alt="" loading="lazy" />
                {isMore && <span className={styles.more}>+{hidden}</span>}
              </button>
            );
          })}
        </div>
      )}
      {children}
    </article>
  );
}
