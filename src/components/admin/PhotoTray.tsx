"use client";
/* eslint-disable @next/next/no-img-element -- photos are served by our own gated route */

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

type TileActions = {
  onHeadline: (photoId: string) => void;
  onRemove: (item: TrayItem) => void;
  onRetry: (item: TrayItem) => void;
};

function Tile({ item, isHeadline, onHeadline, onRemove, onRetry }: { item: TrayItem; isHeadline: boolean } & TileActions) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });
  return (
    <li
      ref={setNodeRef}
      data-testid="photo-tile"
      data-photo-id={item.photo?.id}
      data-width={item.photo?.width}
      data-height={item.photo?.height}
      className={isHeadline ? styles.tileHeadline : styles.tile}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      {/* The photo is the drag handle: press and hold on a phone, or drag with a mouse. */}
      <div
        ref={setActivatorNodeRef}
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        onContextMenu={(e) => e.preventDefault()}
      >
        <img src={item.photo?.thumbUrl ?? item.preview} alt="" className={styles.tileImage} draggable={false} />
      </div>
      <div className={styles.tileBar}>
        <span className={item.stage.kind === "failed" ? styles.tileError : styles.tileStage}>{stageLabel(item.stage)}</span>
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
}

export function PhotoTray({
  items,
  headlineId,
  onMove,
  ...actions
}: {
  items: TrayItem[];
  headlineId: string | null;
  onMove: (activeKey: string, overKey: string) => void;
} & TileActions) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short hold before dragging, so swiping over the photos still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
  }

  return (
    <DndContext id="photo-tray" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.key)} strategy={rectSortingStrategy}>
        <ul className={styles.tray}>
          {items.map((item) => (
            <Tile
              key={item.key}
              item={item}
              isHeadline={item.photo !== undefined && item.photo.id === headlineId}
              {...actions}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
