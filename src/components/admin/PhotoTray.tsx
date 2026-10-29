"use client";

import type { UploadStage } from "@/client/upload";
import type { EditablePhoto } from "@/posts/types";
import styles from "./editor.module.css";

export type TrayItem = { key: string; file?: File; preview?: string; stage: UploadStage; photo?: EditablePhoto };

function stageLabel(stage: UploadStage): string {
  switch (stage.kind) {
    case "reading":
      return "Reading…";
    case "resizing":
      return "Resizing…";
    case "uploading":
      return `Uploading ${stage.pct}%`;
    case "finishing":
      return "Finishing…";
    case "done":
      return "Done";
    case "failed":
      return stage.message;
  }
}

export function PhotoTray({
  items,
  headlineId,
  onHeadline,
  onRemove,
  onRetry,
}: {
  items: TrayItem[];
  headlineId: string | null;
  onHeadline: (photoId: string) => void;
  onRemove: (item: TrayItem) => void;
  onRetry: (item: TrayItem) => void;
}) {
  return (
    <ul className={styles.tray}>
      {items.map((item) => {
        const isHeadline = item.photo !== undefined && item.photo.id === headlineId;
        return (
          <li
            key={item.key}
            data-testid="photo-tile"
            data-width={item.photo?.width}
            data-height={item.photo?.height}
            className={isHeadline ? styles.tileHeadline : styles.tile}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- photos are served by our own gated route */}
            <img src={item.photo?.thumbUrl ?? item.preview} alt="" className={styles.tileImage} />
            <div className={styles.tileBar}>
              <span className={item.stage.kind === "failed" ? styles.tileError : styles.tileStage}>
                {stageLabel(item.stage)}
              </span>
              {item.stage.kind === "failed" && item.file && (
                <button type="button" className={styles.tileButton} onClick={() => onRetry(item)}>
                  Retry
                </button>
              )}
              {item.photo && (
                <>
                  <button
                    type="button"
                    aria-label="Headline"
                    aria-pressed={isHeadline}
                    title="Use as headline photo"
                    className={isHeadline ? styles.starOn : styles.star}
                    onClick={() => onHeadline(item.photo!.id)}
                  >
                    ★
                  </button>
                  <button type="button" className={styles.tileButton} onClick={() => onRemove(item)}>
                    Remove
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
