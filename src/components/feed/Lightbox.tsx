"use client";
/* eslint-disable @next/next/no-img-element -- photos come from our own gated /photos route */

import { useEffect, useRef } from "react";
import type { PhotoView } from "@/posts/types";
import styles from "./feed.module.css";

const SWIPE_PX = 50;

export function Lightbox({
  photos,
  index,
  title,
  onIndexChange,
  onClose,
}: {
  photos: PhotoView[];
  index: number;
  title: string;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const n = photos.length;
  const step = (delta: number) => onIndexChange((index + delta + n) % n);
  const stepRef = useRef(step);
  const closeRef = useRef(onClose);
  const swipeStart = useRef<number | null>(null);

  useEffect(() => {
    stepRef.current = step;
    closeRef.current = onClose;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "ArrowRight") stepRef.current(1);
      if (e.key === "ArrowLeft") stepRef.current(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const photo = photos[index];
  return (
    <div
      className={styles.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onPointerDown={(e) => {
        swipeStart.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (swipeStart.current === null) return;
        const dx = e.clientX - swipeStart.current;
        swipeStart.current = null;
        if (Math.abs(dx) >= SWIPE_PX) step(dx < 0 ? 1 : -1);
      }}
    >
      <img
        key={photo.id}
        src={photo.displayUrl}
        width={photo.width}
        height={photo.height}
        alt=""
        className={styles.lightboxImage}
        draggable={false}
      />
      {n > 1 && (
        <>
          <button type="button" className={styles.lightboxPrev} aria-label="Previous photo" onClick={() => step(-1)}>
            ‹
          </button>
          <button type="button" className={styles.lightboxNext} aria-label="Next photo" onClick={() => step(1)}>
            ›
          </button>
        </>
      )}
      <button type="button" className={styles.lightboxClose} aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div className={styles.lightboxCaption}>
        {title} · {index + 1} / {n}
      </div>
    </div>
  );
}
