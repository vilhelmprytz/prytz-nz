import type { EditablePhoto } from "@/posts/types";
import { readPhotoMeta } from "./exif";
import { resizeImage } from "./resize";

export const DISPLAY_EDGE = 2560;
export const THUMB_EDGE = 640;
export const QUALITY = 0.8;

export class UploadFailedError extends Error {}

type RetryOptions = { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retries network errors and 5xx with exponential backoff; a 4xx is final. */
export async function uploadWithRetry(put: () => Promise<Response>, opts: RetryOptions = {}): Promise<void> {
  const { attempts = 4, baseDelayMs = 1000, sleep = wait } = opts;
  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await put();
    } catch {
      // Network error: retry below.
    }
    if (res?.ok) return;
    if (res && res.status < 500) throw new UploadFailedError(`Upload rejected (${res.status})`);
    if (attempt >= attempts) throw new UploadFailedError("Upload failed. Check your connection.");
    await sleep(baseDelayMs * 2 ** (attempt - 1));
  }
}

export type UploadStage =
  | { kind: "reading" | "resizing" | "finishing" | "done" }
  | { kind: "uploading"; pct: number }
  | { kind: "failed"; message: string };

/** With no progress for this long, the connection is treated as dead (mobile dead zones hang rather than fail). */
export const STALL_MS = 30_000;

export function putWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
  stallMs = STALL_MS,
) {
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const fail = (message: string) => {
      clearTimeout(watchdog);
      reject(new TypeError(message));
    };
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        xhr.abort();
        fail("Upload stalled");
      }, stallMs);
    };
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      arm();
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      clearTimeout(watchdog);
      resolve(new Response(null, { status: xhr.status }));
    };
    xhr.onerror = () => fail("Network error");
    xhr.ontimeout = () => fail("Network timeout");
    arm();
    xhr.send(blob);
  });
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new UploadFailedError(data.reason ?? data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Reads EXIF, resizes on the phone, uploads both sizes straight to storage, then confirms with the app. */
export async function uploadPhoto(file: File, postId: string, onStage: (s: UploadStage) => void): Promise<EditablePhoto> {
  try {
    onStage({ kind: "reading" });
    const meta = await readPhotoMeta(file);
    onStage({ kind: "resizing" });
    const display = await resizeImage(file, DISPLAY_EDGE, QUALITY);
    const thumb = await resizeImage(display.blob, THUMB_EDGE, QUALITY);

    const { photoId, displayPutUrl, thumbPutUrl } = await postJson<{
      photoId: string;
      displayPutUrl: string;
      thumbPutUrl: string;
    }>("/api/admin/uploads", {
      postId,
      meta: { ...meta, width: display.width, height: display.height, contentType: display.contentType },
    });

    // Progress weights the display image; the thumbnail is small.
    onStage({ kind: "uploading", pct: 0 });
    await uploadWithRetry(() =>
      putWithProgress(displayPutUrl, display.blob, display.contentType, (f) =>
        onStage({ kind: "uploading", pct: Math.round(f * 90) }),
      ),
    );
    await uploadWithRetry(() => putWithProgress(thumbPutUrl, thumb.blob, display.contentType, () => {}));
    onStage({ kind: "uploading", pct: 100 });

    onStage({ kind: "finishing" });
    const { photo } = await postJson<{ photo: EditablePhoto }>(`/api/admin/uploads/${photoId}/complete`);
    onStage({ kind: "done" });
    return photo;
  } catch (error) {
    const message = error instanceof UploadFailedError ? error.message : "Couldn't read this photo.";
    onStage({ kind: "failed", message });
    throw error;
  }
}
