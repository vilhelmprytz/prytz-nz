"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pickPostDefaults } from "@/client/post-defaults";
import { uploadClip, uploadPhoto, type UploadStage } from "@/client/upload";
import { deletePostAction, publishAction, removePhotoAction, savePostAction, unpublishAction } from "@/posts/actions";
import type { EditablePhoto, EditablePost, LatLng, PostFieldsInput } from "@/posts/types";
import type { LocationSource } from "./LocationPicker";
import { PhotoTray, type TrayItem } from "./PhotoTray";
import styles from "./editor.module.css";

const LocationPicker = dynamic(() => import("./LocationPicker"), {
  ssr: false,
  loading: () => <div className={styles.map} />,
});

const AUTOSAVE_MS = 1500;
const RETRY_SAVE_MS = 5000;
const CONCURRENT_UPLOADS = 2;

const SOURCE_LABEL: Record<LocationSource, string> = {
  photo: "From photo GPS",
  device: "From your phone",
  pin: "Pinned by hand",
};

type Fields = Omit<PostFieldsInput, "photoOrder">;
type SaveState = "idle" | "saving" | "saved" | "error";

let nextKey = 0;

export function PostEditor({ initial }: { initial: EditablePost }) {
  const postId = initial.id;
  const [fields, setFields] = useState<Fields>(() => ({
    title: initial.title,
    description: initial.description,
    placeName: initial.placeName,
    points: initial.points,
    takenAtLocal: initial.takenAtLocal,
    utcOffset: initial.utcOffset,
    headlinePhotoId: initial.headlinePhotoId,
  }));
  const [items, setItems] = useState<TrayItem[]>(() =>
    initial.photos.map((photo) => ({ key: photo.id, stage: { kind: "done" }, photo })),
  );
  const [status, setStatus] = useState(initial.status);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null);

  // Latest values for callbacks that outlive a render (timers, uploads). Only event handlers touch these.
  const fieldsRef = useRef(fields);
  // Tray order (item keys, in picking/dragging order) and the finished photo behind each key.
  const orderRef = useRef<string[]>(initial.photos.map((p) => p.id));
  const photoByKey = useRef(new Map<string, EditablePhoto>(initial.photos.map((p) => [p.id, p])));
  // Which values the admin set by hand; defaults never overwrite those.
  const byHand = useRef({
    date: initial.takenAtLocal !== null,
    location: initial.points.length > 0,
    place: initial.placeName !== "",
    // A saved headline other than the first photo must have been starred.
    headline:
      initial.headlinePhotoId !== null &&
      initial.headlinePhotoId !== initial.photos.find((p) => p.kind === "photo")?.id,
  });

  /** Finished photos in tray order: the order the site shows them in. */
  const orderedPhotos = useCallback(
    () => orderRef.current.flatMap((key) => photoByKey.current.get(key) ?? []),
    [],
  );

  const photos = items.flatMap((i) => (i.photo ? [i.photo] : []));
  const uploading = items.some((i) => i.stage.kind !== "done" && i.stage.kind !== "failed");

  // ---------- autosave ----------
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveRef = useRef<() => Promise<boolean>>(async () => true);

  const save = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (!dirty.current) return true;
    dirty.current = false;
    setSaveState("saving");
    try {
      await savePostAction(postId, { ...fieldsRef.current, photoOrder: orderedPhotos().map((p) => p.id) });
      setSaveState("saved");
      return true;
    } catch {
      dirty.current = true;
      setSaveState("error");
      saveTimer.current = setTimeout(() => void saveRef.current(), RETRY_SAVE_MS);
      return false;
    }
  }, [postId, orderedPhotos]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const update = useCallback((patch: Partial<Fields>) => {
    fieldsRef.current = { ...fieldsRef.current, ...patch };
    setFields(fieldsRef.current);
    dirty.current = true;
    // Never show "Saved" while a change is still waiting for the autosave delay.
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
  }, []);

  // ---------- uploads ----------
  const queue = useRef<TrayItem[]>([]);
  const active = useRef(0);
  const pumpRef = useRef<() => void>(() => {});
  // Clips compress one at a time (the heavy part); photos keep their own two upload slots.
  const clipQueue = useRef<TrayItem[]>([]);
  const clipActive = useRef(false);
  const pumpClipsRef = useRef<() => void>(() => {});
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const wakeLockPending = useRef(false);

  const setStage = (key: string, stage: UploadStage, photo?: TrayItem["photo"]) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, stage, photo: photo ?? i.photo } : i)));

  /** After the photo order changes: unless a headline was starred, the first photo leads. Then save. */
  const orderChanged = useCallback(() => {
    // Only a photo can lead the post; clips are skipped.
    const first = orderedPhotos().find((p) => p.kind === "photo")?.id ?? null;
    update(byHand.current.headline ? {} : { headlinePhotoId: first });
  }, [update, orderedPhotos]);

  /** Once a batch settles, fill date and location from the photos (never over the admin's own values). */
  const applyPhotoDefaults = useCallback(() => {
    const list = orderedPhotos();
    if (list.length === 0) return;
    const current = fieldsRef.current;
    const defaults = pickPostDefaults(list, Math.max(0, list.findIndex((p) => p.id === current.headlinePhotoId)));
    const patch: Partial<Fields> = {};
    if (!byHand.current.date && defaults.takenAtLocal && defaults.takenAtLocal !== current.takenAtLocal) {
      patch.takenAtLocal = defaults.takenAtLocal;
      patch.utcOffset = defaults.utcOffset;
    }
    // Photo GPS only ever sets the first and only point; a travel day's extra stops are added by hand.
    const first = current.points[0];
    if (
      !byHand.current.location &&
      defaults.lat !== null &&
      defaults.lng !== null &&
      (current.points.length !== 1 || first.lat !== defaults.lat || first.lng !== defaults.lng)
    ) {
      patch.points = [{ lat: defaults.lat, lng: defaults.lng }];
      setLocationSource("photo");
    }
    if (Object.keys(patch).length > 0) update(patch);
  }, [update, orderedPhotos]);

  /** Nothing uploading or compressing: photo date and location defaults can be applied. */
  const settled = () =>
    active.current === 0 && queue.current.length === 0 && !clipActive.current && clipQueue.current.length === 0;

  const pump = useCallback(() => {
    while (active.current < CONCURRENT_UPLOADS && queue.current.length > 0) {
      const item = queue.current.shift()!;
      active.current++;
      uploadPhoto(item.file!, postId, (stage) => setStage(item.key, stage))
        .then((photo) => {
          photoByKey.current.set(item.key, photo);
          setStage(item.key, { kind: "done" }, photo);
          // Saves the picking order (uploads finish in any order) and the default headline.
          orderChanged();
        })
        .catch(() => {})
        .finally(() => {
          active.current--;
          if (settled()) applyPhotoDefaults();
          pumpRef.current();
        });
    }
  }, [postId, applyPhotoDefaults, orderChanged]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const clipsIdle = useCallback(() => !clipActive.current && clipQueue.current.length === 0, []);

  /** Keep the screen on while clips compress: one lock at a time, never left behind. The browser may refuse. */
  const holdWakeLock = useCallback(() => {
    if ((wakeLock.current && !wakeLock.current.released) || wakeLockPending.current || !navigator.wakeLock) return;
    wakeLockPending.current = true;
    navigator.wakeLock
      .request("screen")
      .then((lock) => {
        // The clips may have finished (or failed) before the lock arrived.
        if (clipsIdle()) void lock.release().catch(() => {});
        else wakeLock.current = lock;
      })
      .catch(() => {})
      .finally(() => {
        wakeLockPending.current = false;
      });
  }, [clipsIdle]);

  const releaseWakeLock = useCallback(() => {
    const lock = wakeLock.current;
    wakeLock.current = null;
    void lock?.release().catch(() => {});
  }, []);

  const pumpClips = useCallback(() => {
    if (clipActive.current || clipQueue.current.length === 0) return;
    const item = clipQueue.current.shift()!;
    clipActive.current = true;
    holdWakeLock();
    // Clip dates are UTC; convert them with the post's photos' offset when there is one.
    const offsetHint = orderedPhotos().find((p) => p.utcOffset)?.utcOffset ?? null;
    uploadClip(item.file!, postId, offsetHint, (stage) => setStage(item.key, stage), item.kept)
      .then((clip) => {
        photoByKey.current.set(item.key, clip);
        setStage(item.key, { kind: "done" }, clip);
        orderChanged();
      })
      .catch(() => {})
      .finally(() => {
        clipActive.current = false;
        if (clipsIdle()) releaseWakeLock();
        if (settled()) applyPhotoDefaults();
        pumpClipsRef.current();
      });
  }, [postId, applyPhotoDefaults, orderChanged, orderedPhotos, clipsIdle, holdWakeLock, releaseWakeLock]);

  useEffect(() => {
    pumpClipsRef.current = pumpClips;
  }, [pumpClips]);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const added = Array.from(files).map((file): TrayItem => {
      const isClip = file.type.startsWith("video/");
      return {
        key: `upload-${nextKey++}`,
        file,
        // A clip has no image to preview until its poster frame is uploaded.
        preview: isClip ? undefined : URL.createObjectURL(file),
        stage: { kind: "reading" },
        ...(isClip ? { clip: true, kept: {} } : {}),
      };
    });
    setItems((list) => [...list, ...added]);
    orderRef.current = [...orderRef.current, ...added.map((i) => i.key)];
    queue.current.push(...added.filter((i) => !i.clip));
    clipQueue.current.push(...added.filter((i) => i.clip));
    pump();
    pumpClips();
  }

  function retry(item: TrayItem) {
    // A clip keeps its compressed file in `kept`, so Retry only re-uploads it.
    const again = { ...item, stage: { kind: "reading" } as UploadStage };
    setItems((list) => list.map((i) => (i.key === item.key ? again : i)));
    if (again.clip) {
      clipQueue.current.push(again);
      pumpClips();
    } else {
      queue.current.push(again);
      pump();
    }
  }

  async function remove(item: TrayItem) {
    if (!item.photo) return;
    const removedId = item.photo.id;
    await removePhotoAction(removedId);
    photoByKey.current.delete(item.key);
    orderRef.current = orderRef.current.filter((key) => key !== item.key);
    setItems((list) => list.filter((i) => i.key !== item.key));
    if (fieldsRef.current.headlinePhotoId === removedId) byHand.current.headline = false;
    orderChanged();
  }

  function move(activeKey: string, overKey: string) {
    const from = orderRef.current.indexOf(activeKey);
    const to = orderRef.current.indexOf(overKey);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...orderRef.current];
    next.splice(to, 0, ...next.splice(from, 1));
    orderRef.current = next;
    setItems((list) => next.flatMap((key) => list.find((i) => i.key === key) ?? []));
    orderChanged();
  }

  function star(photoId: string) {
    byHand.current.headline = true;
    update({ headlinePhotoId: photoId });
  }

  // ---------- place name (from the last point: where the day ended) ----------
  const lastLat = fields.points.at(-1)?.lat ?? null;
  const lastLng = fields.points.at(-1)?.lng ?? null;
  useEffect(() => {
    if (byHand.current.place || lastLat === null || lastLng === null) return;
    const controller = new AbortController();
    fetch(`/api/admin/geocode?lat=${lastLat}&lng=${lastLng}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { placeName?: string }) => {
        if (d.placeName && !byHand.current.place) update({ placeName: d.placeName });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [lastLat, lastLng, update]);

  function changePoints(points: LatLng[], source: LocationSource) {
    byHand.current.location = true;
    setLocationSource(source);
    update({ points });
  }

  // ---------- publishing ----------
  async function togglePublished() {
    setErrors([]);
    dirty.current = true;
    if (!(await save())) return;
    const result = status === "published" ? await unpublishAction(postId) : await publishAction(postId);
    if (result.ok) setStatus(status === "published" ? "draft" : "published");
    else setErrors(result.errors);
  }

  async function deletePost() {
    if (!confirm("Delete this post and all its photos?")) return;
    clearTimeout(saveTimer.current);
    dirty.current = false;
    await deletePostAction(postId);
  }

  const missingLocation = !uploading && photos.length > 0 && fields.points.length === 0;

  return (
    <main className={styles.editor}>
      <div className={styles.topBar}>
        <Link href="/admin" className={styles.back}>
          ← Posts
        </Link>
        <span className={styles.saveState} aria-live="polite">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved, retrying" : ""}
        </span>
      </div>

      <section className={styles.section}>
        <label className={styles.addPhotos}>
          Add photos
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            className={styles.visuallyHidden}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <PhotoTray
          items={items}
          headlineId={fields.headlinePhotoId}
          onHeadline={star}
          onRemove={remove}
          onRetry={retry}
          onMove={move}
        />
      </section>

      <section className={styles.section}>
        <label className={styles.field}>
          <span>Title</span>
          <input value={fields.title} onChange={(e) => update({ title: e.target.value })} />
        </label>
        <label className={styles.field}>
          <span>Description</span>
          <textarea rows={6} value={fields.description} onChange={(e) => update({ description: e.target.value })} />
        </label>
        <label className={styles.field}>
          <span>Date</span>
          <input
            type="datetime-local"
            value={fields.takenAtLocal?.slice(0, 16) ?? ""}
            onChange={(e) => {
              byHand.current.date = true;
              update({ takenAtLocal: e.target.value ? `${e.target.value.slice(0, 16)}:00` : null });
            }}
          />
        </label>
      </section>

      <section className={styles.section}>
        <div className={styles.fieldLabel}>
          <span>Location</span>
          {locationSource && <span data-testid="location-source">{SOURCE_LABEL[locationSource]}</span>}
        </div>
        {missingLocation && (
          <p className={styles.notice}>No location in these photos. Use your current location or drop a pin.</p>
        )}
        <LocationPicker points={fields.points} onChange={changePoints} />
        <label className={styles.field}>
          <span>Place</span>
          <input
            value={fields.placeName}
            onChange={(e) => {
              byHand.current.place = e.target.value !== "";
              update({ placeName: e.target.value });
            }}
          />
        </label>
      </section>

      {errors.length > 0 && (
        <ul className={styles.errors} role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.primaryButton} onClick={togglePublished} disabled={uploading}>
          {status === "published" ? "Unpublish" : "Publish"}
        </button>
        {status === "published" && (
          <Link href={`/?post=${postId}`} className={styles.secondaryButton}>
            View on site
          </Link>
        )}
        <button type="button" className={styles.dangerButton} onClick={deletePost}>
          Delete
        </button>
      </div>
    </main>
  );
}
