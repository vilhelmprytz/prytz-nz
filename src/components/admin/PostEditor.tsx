"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pickPostDefaults } from "@/client/post-defaults";
import { uploadPhoto, type UploadStage } from "@/client/upload";
import { deletePostAction, publishAction, removePhotoAction, savePostAction, unpublishAction } from "@/posts/actions";
import type { EditablePost, LatLng, PostFieldsInput } from "@/posts/types";
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
  const photosRef = useRef(initial.photos);
  // Which values the admin set by hand; photo defaults never overwrite those.
  const byHand = useRef({
    date: initial.takenAtLocal !== null,
    location: initial.points.length > 0,
    place: initial.placeName !== "",
  });

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
      await savePostAction(postId, { ...fieldsRef.current, photoOrder: photosRef.current.map((p) => p.id) });
      setSaveState("saved");
      return true;
    } catch {
      dirty.current = true;
      setSaveState("error");
      saveTimer.current = setTimeout(() => void saveRef.current(), RETRY_SAVE_MS);
      return false;
    }
  }, [postId]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const update = useCallback((patch: Partial<Fields>) => {
    fieldsRef.current = { ...fieldsRef.current, ...patch };
    setFields(fieldsRef.current);
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
  }, []);

  // ---------- uploads ----------
  const queue = useRef<TrayItem[]>([]);
  const active = useRef(0);
  const pumpRef = useRef<() => void>(() => {});

  const setStage = (key: string, stage: UploadStage, photo?: TrayItem["photo"]) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, stage, photo: photo ?? i.photo } : i)));

  /** Once a batch settles, fill date and location from the photos (never over the admin's own values). */
  const applyPhotoDefaults = useCallback(() => {
    const list = photosRef.current;
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
  }, [update]);

  const pump = useCallback(() => {
    while (active.current < CONCURRENT_UPLOADS && queue.current.length > 0) {
      const item = queue.current.shift()!;
      active.current++;
      uploadPhoto(item.file!, postId, (stage) => setStage(item.key, stage))
        .then((photo) => {
          photosRef.current = [...photosRef.current, photo];
          setStage(item.key, { kind: "done" }, photo);
          // The server makes the first photo the headline; mirror that here.
          if (!fieldsRef.current.headlinePhotoId) {
            fieldsRef.current = { ...fieldsRef.current, headlinePhotoId: photo.id };
            setFields(fieldsRef.current);
          }
        })
        .catch(() => {})
        .finally(() => {
          active.current--;
          if (active.current === 0 && queue.current.length === 0) applyPhotoDefaults();
          pumpRef.current();
        });
    }
  }, [postId, applyPhotoDefaults]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const added = Array.from(files).map(
      (file): TrayItem => ({
        key: `upload-${nextKey++}`,
        file,
        preview: URL.createObjectURL(file),
        stage: { kind: "reading" },
      }),
    );
    setItems((list) => [...list, ...added]);
    queue.current.push(...added);
    pump();
  }

  function retry(item: TrayItem) {
    const again = { ...item, stage: { kind: "reading" } as UploadStage };
    setItems((list) => list.map((i) => (i.key === item.key ? again : i)));
    queue.current.push(again);
    pump();
  }

  async function remove(item: TrayItem) {
    if (!item.photo) return;
    const removedId = item.photo.id;
    await removePhotoAction(removedId);
    photosRef.current = photosRef.current.filter((p) => p.id !== removedId);
    setItems((list) => list.filter((i) => i.key !== item.key));
    if (fieldsRef.current.headlinePhotoId === removedId) {
      update({ headlinePhotoId: photosRef.current[0]?.id ?? null });
    }
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
            accept="image/*"
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
          onHeadline={(id) => update({ headlinePhotoId: id })}
          onRemove={remove}
          onRetry={retry}
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
