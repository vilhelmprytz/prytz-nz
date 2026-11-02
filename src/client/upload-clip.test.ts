import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { uploadClip, type KeptClip } from "./upload";

vi.mock("./video", () => ({
  ensureVideoEncoding: vi.fn(async () => {}),
  readClipInfo: vi.fn(async () => ({ durationMs: 8000, width: 3840, height: 2160, takenAtUtc: null })),
  checkClipLength: vi.fn(),
  clipTakenAtLocal: vi.fn(() => null),
  localOffset: vi.fn(() => "+00:00"),
  compressClip: vi.fn(async () => ({ blob: new Blob(["v"], { type: "video/mp4" }), width: 1920, height: 1080, durationMs: 8000 })),
  posterFrame: vi.fn(async () => new Blob(["p"], { type: "image/png" })),
}));
vi.mock("./resize", () => ({
  resizeImage: vi.fn(async () => ({ blob: new Blob(["i"], { type: "image/webp" }), width: 1920, height: 1080, contentType: "image/webp" })),
}));

let opened: string[] = [];
let statusFor: (url: string) => number = () => 200;

class InstantXHR {
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
  status = 0;
  url = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  abort() {}
  send() {
    opened.push(this.url);
    setTimeout(() => {
      this.status = statusFor(this.url);
      this.onload?.();
    }, 0);
  }
}

beforeEach(() => {
  opened = [];
  statusFor = () => 200;
  vi.stubGlobal("XMLHttpRequest", InstantXHR);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/admin/uploads"
        ? Response.json({ photoId: "c1", displayPutUrl: "/put/display", thumbPutUrl: "/put/thumb", videoPutUrl: "/put/video" })
        : Response.json({ photo: { id: "c1", kind: "video" } }),
    ),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const file = new File(["4k"], "clip.mp4", { type: "video/mp4" });

test("uploads both poster images before the clip, so the clip's link can't expire while they wait", async () => {
  await uploadClip(file, "post", null, () => {});
  expect(opened).toEqual(["/put/display", "/put/thumb", "/put/video"]);
});

test("forgets the compressed clip once it's uploaded", async () => {
  const kept: KeptClip = {};
  await uploadClip(file, "post", null, () => {}, kept);
  expect(kept.compressed).toBeUndefined();
});

test("keeps the compressed clip when the upload fails, so Retry doesn't compress again", async () => {
  statusFor = (url) => (url === "/put/video" ? 403 : 200);
  const kept: KeptClip = {};
  await expect(uploadClip(file, "post", null, () => {}, kept)).rejects.toThrow();
  expect(kept.compressed?.durationMs).toBe(8000);
});
