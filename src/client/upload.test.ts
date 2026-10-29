import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { putWithProgress, UploadFailedError, uploadWithRetry } from "./upload";

const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});

beforeEach(() => {
  sleep.mockClear();
});

test("retries 5xx then succeeds", async () => {
  const put = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  await uploadWithRetry(put, { sleep });
  expect(put).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledWith(1000);
});

test("network errors retried with backoff, gives up after 4", async () => {
  const put = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(uploadWithRetry(put, { sleep })).rejects.toBeInstanceOf(UploadFailedError);
  expect(put).toHaveBeenCalledTimes(4);
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000]);
});

test("4xx is not retried", async () => {
  const put = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
  await expect(uploadWithRetry(put, { sleep })).rejects.toThrow();
  expect(put).toHaveBeenCalledTimes(1);
});

// An XHR that never answers on its own, like a connection hung in a mobile dead zone.
class HangingXHR {
  static last: HangingXHR;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  status = 0;
  aborted = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    HangingXHR.last = this;
  }
  open() {}
  setRequestHeader() {}
  send() {}
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a stalled upload is aborted as a network error, so it gets retried", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("XMLHttpRequest", HangingXHR);
  const put = putWithProgress("/u", new Blob(["x"]), "image/webp", () => {}, 30_000);
  const outcome = expect(put).rejects.toBeInstanceOf(TypeError);
  await vi.advanceTimersByTimeAsync(30_000);
  await outcome;
  expect(HangingXHR.last.aborted).toBe(true);
});

test("progress keeps a slow upload alive", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("XMLHttpRequest", HangingXHR);
  const put = putWithProgress("/u", new Blob(["x"]), "image/webp", () => {}, 30_000);
  await vi.advanceTimersByTimeAsync(20_000);
  HangingXHR.last.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
  await vi.advanceTimersByTimeAsync(20_000);
  expect(HangingXHR.last.aborted).toBe(false);
  HangingXHR.last.status = 200;
  HangingXHR.last.onload?.();
  expect((await put).status).toBe(200);
});
