# Video Clips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let posts contain short video clips next to their photos. Clips are compressed on the phone, stored in R2, served through the app with `Range` support, and played on tap.

**Architecture:**
- Clips are rows in the existing `photos` table, with `kind = 'video'`. The poster frame takes the usual display and thumb images, and the MP4 goes under a new `video_key`.
- The browser converts each clip with Mediabunny (WebCodecs) and takes a poster frame from it, then uploads three objects with the existing presign, PUT and complete flow.
- `/photos/<id>/video` streams the MP4 with byte ranges. The feed and the full-screen view branch on `kind`.

**Tech Stack:** Next.js 16 / React 19, Drizzle + Postgres, `mediabunny@1.61.6` (WebCodecs), Vitest + PGlite, Playwright (Chromium).

**Spec:** `docs/superpowers/specs/2026-10-31-video-clips-design.md`. It builds on `docs/superpowers/specs/2026-10-27-travel-journal-design.md`.

## Global Constraints

- **Mediabunny:** install as `mediabunny@1.61.6`, exact, from npm, bundled with the app.
- **Compressed clip:**
  - video: H.264 (`avc`) at `5_000_000` bit/s; long edge ≤ 1920, never upscaled; both dimensions even
  - audio: copied when it's AAC, otherwise AAC
  - container: MP4 with `fastStart: "in-memory"`; content type `video/mp4`
- **Limits:**
  - clip length ≤ 2 minutes (`120_000` ms); longer ones fail with the exact copy `Clips can be at most 2 minutes`
  - compressed clip ≤ 150 MB (`MAX_VIDEO_BYTES = 150 * 1024 * 1024`)
- **Poster:** the frame at 0.5 s, or the first frame when the clip is shorter than 1 s. Display size long edge ≤ 1920, thumb 640, WebP falling back to JPEG, quality 0.8.
- **R2 keys:** `photos/<uuid>/video.mp4`, next to the existing `display.<ext>` and `thumb.<ext>`.
- **Serving:** `GET /photos/<id>/video`:
  - same access rules and `Cache-Control: private, max-age=31536000, immutable` as photos
  - `Range` support: `206` with `Content-Range: bytes a-b/total`, `Accept-Ranges: bytes`, `416` when unsatisfiable
- **The headline is always a photo.** A clip is never set as, chosen as, or fallen back to as the headline.
- **Tile copy (editor):**
  - stages: `Reading…`, `Compressing NN%`, `Uploading NN%`, `Finishing…`, `Done`; while compressing, the tile also says `Keep this page open`
  - failure: `Couldn't read this clip (<step>: <Name>: <message> — <file note>)`
- **Reader copy:**
  - clip tiles: aria-label `Video N`, with N the item's position in the post (the headline is 1)
  - duration badge: `m:ss` (`0:08`, `1:02`)
  - grid and miniatures show a ▶ symbol on clips
- **Concurrency:** at most one clip compresses at a time. Photos keep their two upload slots. Upload links are requested after compression. Retry re-uploads the kept compressed clip without compressing again.
- **Readers' playback:** `<video controls playsinline preload="metadata" poster=…>`. It never autoplays and pauses when you move away from it. The bottom 60 px of the video ignore swipe navigation.

## Review Focus

1. **iPhone Safari seeking or playing a clip.** Expected: correct `206` partial responses for open-ended, closed and suffix ranges, with `416` for out-of-range requests. Unit tests in Task 2; manual iPhone check in Task 7.
2. **A post that has clips but no photo.** Expected: it can't be published (`Choose a headline photo`), and no code path makes a clip the headline. Tests in Task 1.
3. **A clip over 2 minutes, or a browser that can't encode H.264.** Expected: that tile fails with a clear message while photos keep uploading. Tests in Task 4.
4. **The connection drops after compressing.** Expected: Retry re-uploads the kept compressed clip without compressing again. Test in Task 5.
5. **A post's photo grid when a clip is the fifth tile.** Expected: "+N" still stands in for the hidden items, and clip tiles keep their ▶ and duration when the grid is opened. Test in Task 6.

---

## File Structure

```
src/db/schema.ts                      photos: + kind, videoKey, durationMs, videoContentType
drizzle/0004_*.sql                    additive migration (generated)
src/db/migration-video.test.ts        migration on today's schema
src/posts/types.ts                    PhotoView/EditablePhoto/UploadMeta gain clip fields
src/posts/repo.ts                     clip-aware create/complete/remove/delete/cleanup/feed
src/storage/types.ts, s3.ts, fs.ts    get(key, range?) byte ranges
src/photos/serve.ts (+ test)          "video" size with Range handling
src/photos/range.ts (+ test)          parseRange()
src/app/api/admin/uploads/route.ts    accepts clips; returns videoPutUrl
src/posts/upload-request.ts (+ test)  zod schema for the uploads route
src/client/video.ts (+ test)          fitClip, clipTakenAtLocal, checkClipLength, compressClip, posterFrame
src/client/upload.ts (+ test)         uploadClip(); "compressing" stage; clip wording
src/components/admin/PostEditor.tsx   clip queue, wake lock, headline-is-a-photo rules
src/components/admin/PhotoTray.tsx    clip tiles (no ★, poster/placeholder, notes)
src/components/feed/PostCard.tsx      clip tiles (▶ + duration, "Video N")
src/components/feed/Lightbox.tsx      <video> items, pause on leave, swipe guard, ▶ miniatures
e2e/fixtures.ts                       makeClip(page, opts) → MP4 Buffer
e2e/seed.setup.ts                     Auckland gets one clip
e2e/admin.spec.ts, e2e/feed.spec.ts   clip upload/retry/playback tests
```

---

### Task 1: Clip-aware data model and repository

**Files:**
- Modify: `src/db/schema.ts`, `src/posts/types.ts`, `src/posts/repo.ts`, `src/posts/repo.test.ts`
- Create: `drizzle/0004_*.sql` (`npm run db:generate`), `src/db/migration-video.test.ts`

**Interfaces:**
- Produces:
  - **Schema:** `photos.kind` (text enum `'photo' | 'video'`, not null, default `'photo'`), `photos.videoKey` (text, null), `photos.durationMs` (integer, null), `photos.videoContentType` (text, null).
  - **Types:**
    - `type MediaKind = 'photo' | 'video'`
    - `PhotoView` gains `kind: MediaKind`, plus for clips `videoUrl?: string` (`/photos/<id>/video`) and `durationMs?: number`
    - `UploadMeta` gains `kind: MediaKind` and, for clips, `durationMs: number` and `videoContentType: 'video/mp4'`
  - **Repo:**
    - `export const MAX_VIDEO_BYTES = 150 * 1024 * 1024`
    - `createPendingPhoto(db, postId, meta: UploadMeta)` returns `{ photoId, displayKey, thumbKey, videoKey: string | null }`
    - `completePhoto`, `removePhoto`, `deletePost`, `cleanupStalePhotos`, `validateForPublish` and `listFeedPage` keep their signatures and become clip-aware as the tests below pin.

- [ ] **Step 1: Write the failing tests**

```ts
// src/db/migration-video.test.ts: same approach as migration-points.test.ts
// (migrate a copy of drizzle/ that stops before 0004_, insert a photo row, then migrate fully)
test("existing photos become kind 'photo' with no video fields", async () => {
  /* after full migrate: select kind, video_key, duration_ms from photos → [{ kind: 'photo', video_key: null, duration_ms: null }] */
});

// src/posts/repo.test.ts  (helper uploadClip(postId) = createPendingPhoto with kind:'video', durationMs:8000,
//  videoContentType:'video/mp4' + storage.put of display/thumb (image/webp) and video (video/mp4))
test("a clip never becomes the headline, even when it finishes first", async () => {
  const postId = await createDraft(db);
  const clip = await completeOk(await uploadClip(postId));
  expect((await getPostForEdit(db, postId))!.headlinePhotoId).toBeNull();
  const photo = await readyPhoto(postId);
  expect((await getPostForEdit(db, postId))!.headlinePhotoId).toBe(photo.id);
  expect(clip.kind).toBe("video");
  expect(clip.videoUrl).toBe(`/photos/${clip.id}/video`);
  expect(clip.durationMs).toBe(8000);
});
test("a post with only clips can't be published", async () => { /* … setPublished → errors include "Choose a headline photo" */ });
test("removing the headline picks the next photo, skipping clips", async () => {
  /* order: photo A (headline), clip, photo B → remove A → headline B */
});
test("feed headline falls back to the first photo, and clips stay in the list", async () => {
  /* published post: clip first in order, then photo → headline is the photo; photos[] contains the clip with kind 'video' */
});
test("clip completion checks the video object: missing, wrong type, too large", async () => {
  /* no video object → "Upload missing"; video stored as image/webp → "Wrong file type"; 151 MB → "File too large"; row and objects removed */
});
test("deleting a post or a stale upload removes the video object too", async () => {
  /* deletePost → storage.head(videoKey) null; pending clip older than 24h → cleanupStalePhotos removes its video object */
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/posts/repo.test.ts src/db/migration-video.test.ts`. Expected: FAIL. The migration test fails on the missing column `kind`; the clip tests fail on the missing fields.

- [ ] **Step 3: Implement the schema, the migration (`npm run db:generate`; additive only, no data copy needed), the types and the repo changes**

- `completePhoto` heads `videoKey` too when the row is a clip, then checks `video/mp4` and `MAX_VIDEO_BYTES`.
- The headline `coalesce` only runs for `kind = 'photo'`.
- `removePhoto` and `listFeedPage` choose the first ready row with `kind = 'photo'`.
- `discardPhoto` and `deletePost` include `videoKey` when it's set.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`. Expected: PASS, with every earlier test still green.

- [ ] **Step 5: Commit** with `feat: store clips alongside photos; headline stays a photo`.

---

### Task 2: Byte-range serving for clips

**Files:**
- Create: `src/photos/range.ts`, `src/photos/range.test.ts`
- Modify: `src/storage/types.ts`, `src/storage/s3.ts`, `src/storage/fs.ts`, `src/storage/fs.test.ts`, `src/photos/serve.ts`, `src/photos/serve.test.ts`, `src/app/photos/[photoId]/[size]/route.ts`

**Interfaces:**
- Produces:
  - `type ByteRange = { start: number; end: number }` (inclusive)
  - `parseRange(header: string | null, size: number): ByteRange | null | "unsatisfiable"`. It supports `bytes=a-b`, `bytes=a-` and `bytes=-n`. Multiple ranges are treated as no range (`null`).
  - `Storage.get(key: string, range?: ByteRange): Promise<StoredObject | null>`, where `StoredObject` gains `range?: ByteRange`. Its `size` stays the full object size.
    - S3 driver: `GetObject` with `Range: bytes=start-end`.
    - fs driver: `createReadStream(file, { start, end })`.
  - `servePhoto(deps, { photoId, size, hasGate, isAdmin, range: string | null })`. `size: "video"` serves `videoKey` for clips only (404 for photos).

- [ ] **Step 1: Write the failing tests**

```ts
// range.test.ts
test.each([
  ["bytes=0-99", 1000, { start: 0, end: 99 }],
  ["bytes=900-", 1000, { start: 900, end: 999 }],
  ["bytes=-100", 1000, { start: 900, end: 999 }],
  ["bytes=0-5000", 1000, { start: 0, end: 999 }],
  [null, 1000, null],
  ["bytes=0-1,5-9", 1000, null],
  ["bytes=1000-", 1000, "unsatisfiable"],
])("parseRange(%s, %d)", (h, size, out) => expect(parseRange(h, size)).toEqual(out));

// fs.test.ts
test("get with a range returns just those bytes and the full size", async () => { /* put 10 bytes; get(key,{start:2,end:4}) → body bytes [2,3,4], size 10 */ });

// serve.test.ts (seed a published clip with a 1000-byte video object)
test("video without Range: 200, full body, Accept-Ranges", async () => { /* status 200, accept-ranges bytes, content-type video/mp4, content-length 1000 */ });
test("video with Range: 206 and Content-Range", async () => {
  const res = await servePhoto(deps, { photoId: clipId, size: "video", hasGate: true, isAdmin: false, range: "bytes=100-199" });
  expect(res.status).toBe(206);
  expect(res.headers.get("content-range")).toBe("bytes 100-199/1000");
  expect(res.headers.get("content-length")).toBe("100");
});
test("unsatisfiable range → 416 with bytes */size", async () => { /* range "bytes=5000-" → 416, content-range "bytes */1000" */ });
test("size 'video' on a photo → 404; draft clip → 404 for readers", async () => {});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/photos src/storage`. Expected: FAIL (`parseRange` is missing, `get` takes no range, `video` is unknown).

- [ ] **Step 3: Implement `parseRange`, ranged `get` in both drivers, the `servePhoto` video branch, and pass `request.headers.get("range")` from the route**

- [ ] **Step 4: Run them and confirm they pass**

Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat: serve clips with byte ranges`.

---

### Task 3: Upload API accepts clips

**Files:**
- Create: `src/posts/upload-request.ts`, `src/posts/upload-request.test.ts`
- Modify: `src/app/api/admin/uploads/route.ts`

**Interfaces:**
- Consumes: `UploadMeta` and `createPendingPhoto` from Task 1.
- Produces:
  - `uploadRequestSchema`, a zod schema for `{ postId, meta }`. `meta` is the existing photo shape plus `kind`; when `kind = 'video'`, `durationMs` (int, 1…120000) and `videoContentType: 'video/mp4'` are required.
  - The route answers `{ photoId, displayPutUrl, thumbPutUrl, videoPutUrl?: string }`. `videoPutUrl` is presigned for `video/mp4` when the item is a clip.

- [ ] **Step 1: Write the failing test**

```ts
test("photo meta still parses; kind defaults to 'photo'", () => { /* existing shape without kind → success, meta.kind 'photo' */ });
test("clip meta needs durationMs ≤ 120000 and video/mp4", () => {
  expect(uploadRequestSchema.safeParse(clip({ durationMs: 8000 })).success).toBe(true);
  expect(uploadRequestSchema.safeParse(clip({ durationMs: 120_001 })).success).toBe(false);
  expect(uploadRequestSchema.safeParse(clip({ durationMs: 8000, videoContentType: "video/quicktime" })).success).toBe(false);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/posts/upload-request.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Move the route's inline schema into `upload-request.ts`, extend it, and presign the video when needed**

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat: upload API accepts clips`.

---

### Task 4: Clip pipeline in the browser

**Files:**
- Create: `src/client/video.ts`, `src/client/video.test.ts`
- Modify: `src/client/upload.ts`, `src/client/upload.test.ts`, `package.json`

**Interfaces:**
- Consumes: `UploadMeta` (Task 1), the uploads route response (Task 3), and the existing `resizeImage`, `uploadWithRetry`, `putWithProgress` and `diagnoseFile`.
- Produces:
  - `fitClip(width: number, height: number, maxEdge = 1920): { width: number; height: number }`. It keeps the aspect ratio, never upscales, and rounds to even numbers.
  - `clipTakenAtLocal(utc: Date | null, offset: string | null): string | null`. Given UTC and `+13:00`, it returns the wall clock at that offset as `YYYY-MM-DDTHH:mm:ss`. With a null offset it uses the phone's current offset.
  - `checkClipLength(durationMs: number): void`. It throws `UploadFailedError("Clips can be at most 2 minutes")` above `120_000`.
  - `ensureVideoEncoding(): Promise<void>`. It throws `UploadFailedError("This browser can't compress video. Use Chrome on your phone.")` when WebCodecs or `canEncodeVideo("avc", { width: 1920, height: 1080, bitrate: 5_000_000 })` is missing.
  - `readClipInfo(file: Blob): Promise<{ durationMs: number; width: number; height: number; takenAtUtc: Date | null }>`.
  - `type CompressedClip = { blob: Blob; width: number; height: number; durationMs: number }`
  - `compressClip(file: Blob, onProgress: (fraction: number) => void): Promise<CompressedClip>`. Settings come from Global Constraints.
  - `posterFrame(clip: Blob): Promise<Blob>`, an image Blob of the frame at 0.5 s (or the first frame).
  - In `src/client/upload.ts`:
    - `UploadStage` gains `{ kind: "compressing"; pct: number }`
    - `Step` gains `"compressing"`
    - `describeUploadError(error, step, fileNote?, what: "photo" | "clip" = "photo")` reads `Couldn't read this clip (…)` when `what` is `"clip"`
    - `uploadClip(file: File, postId: string, offsetHint: string | null, onStage: (s: UploadStage) => void, kept?: { compressed?: CompressedClip; takenAtLocal?: string | null }): Promise<EditablePhoto>`
      - `offsetHint` is the UTC offset of the post's photos, or null for the phone's own offset. It feeds `clipTakenAtLocal`.
      - When `kept.compressed` is set, `uploadClip` skips reading and compressing.
      - On success, or on failure after compressing, it stores the compressed clip in `kept`.

- [ ] **Step 1: Write the failing tests**

```ts
// video.test.ts
test.each([
  [3840, 2160, { width: 1920, height: 1080 }],
  [2160, 3840, { width: 1080, height: 1920 }],
  [1280, 720, { width: 1280, height: 720 }],
  [4000, 3001, { width: 1920, height: 1440 }],
])("fitClip(%d, %d)", (w, h, out) => expect(fitClip(w, h)).toEqual(out));
test("clipTakenAtLocal converts UTC to the place's clock", () => {
  expect(clipTakenAtLocal(new Date("2026-11-02T20:15:00Z"), "+13:00")).toBe("2026-11-03T09:15:00");
  expect(clipTakenAtLocal(null, "+13:00")).toBeNull();
});
test("checkClipLength allows 2:00 and rejects longer", () => {
  expect(() => checkClipLength(120_000)).not.toThrow();
  expect(() => checkClipLength(120_001)).toThrow("Clips can be at most 2 minutes");
});
test("ensureVideoEncoding fails clearly without WebCodecs", async () => {
  vi.stubGlobal("VideoEncoder", undefined);
  await expect(ensureVideoEncoding()).rejects.toThrow("This browser can't compress video");
});
// upload.test.ts
test("clip failures say 'clip'", () => expect(describeUploadError(new DOMException("x", "EncodingError"), "compressing", undefined, "clip"))
  .toBe("Couldn't read this clip (compressing: EncodingError: x)"));
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/client`. Expected: FAIL.

- [ ] **Step 3: Install `mediabunny@1.61.6` and implement `video.ts` and `uploadClip`**

- `compressClip` uses `Conversion.init({ input, output, video: { codec: "avc", ...fitClip(...), fit: "fill", bitrate: 5_000_000 } })` with an `Mp4OutputFormat({ fastStart: "in-memory" })` and a `BufferTarget`. It leaves audio at its defaults (copy when possible), and throws `UploadFailedError` listing `discardedTracks` when `isValid` is false.
- `uploadClip` runs in this order: `ensureVideoEncoding` → `readClipInfo` → `checkClipLength` → `compressClip` → `posterFrame` → register (`/api/admin/uploads` with `kind: 'video'`) → three PUTs → complete. A failure before compression has finished uses step `reading`; a failure during it uses `compressing`.
- `posterFrame` decodes one frame from the compressed clip with Mediabunny's canvas or frame sink, then draws it to a canvas.
- Poster sizes come from the existing `resizeImage` (display at 1920, thumb at 640).
- Uploads use the three presigned URLs with the existing retry and stall logic.

- [ ] **Step 4: Run them and confirm they pass**

Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat: compress clips on the phone and upload them`.

---

### Task 5: Editor support for clips

**Files:**
- Modify: `src/components/admin/PostEditor.tsx`, `src/components/admin/PhotoTray.tsx`, `src/components/admin/editor.module.css`, `e2e/fixtures.ts`, `e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `uploadClip` and the `UploadStage` `"compressing"` stage (Task 4), and `PhotoView.kind` (Task 1).
- Produces:
  - `makeClip(page: Page, opts: { seconds: number; width: number; height: number }): Promise<Buffer>` in `e2e/fixtures.ts`.
    - It opens a blank page and serves the npm bundle `node_modules/mediabunny/dist/bundles/mediabunny.min.mjs` at a routed URL, importing it with `import()` inside `page.evaluate`.
    - It renders coloured canvas frames at 30 fps through `CanvasSource` into an MP4 (`avc`) `BufferTarget`, and returns the bytes.
  - Editor behaviour:
    - The picker accepts `image/*,video/*` and routes `video/*` files to a one-at-a-time clip queue. Photos keep their own two-slot queue.
    - During compression the editor holds a Screen Wake Lock (best effort), and the tile shows `Compressing NN%` and `Keep this page open`.
    - A clip tile has no ★. It shows its poster thumb once done, and a neutral placeholder with ▶ before that. It carries `data-kind="video"`.
    - The default headline is the first item with `kind === 'photo'`.
    - The "starred by hand" rule on load becomes: the saved headline isn't the first photo.
    - Retry on a clip reuses its kept compressed clip.

- [ ] **Step 1: Write the failing e2e tests**

```ts
// e2e/admin.spec.ts
test("a clip uploads next to photos, never takes the headline, and plays on the site", async ({ page }) => {
  test.setTimeout(120_000);
  await newPost(page);
  const clip = await makeClip(page, { seconds: 2, width: 1280, height: 720 });
  await page.getByLabel("Add photos").setInputFiles([
    { name: "clip.mp4", mimeType: "video/mp4", buffer: clip },
    jpeg("p.jpg", await makeJpeg(page, {})),
  ]);
  const tiles = page.getByTestId("photo-tile");
  await expect(tiles.filter({ hasText: "Done" })).toHaveCount(2);
  const clipTile = tiles.and(page.locator('[data-kind="video"]'));
  await expect(clipTile.getByRole("button", { name: "Headline" })).toHaveCount(0);
  await expect(tiles.nth(1).getByRole("button", { name: "Headline" })).toHaveAttribute("aria-pressed", "true");
  // publish (title, date, map tap) → on the site the clip's own URL answers ranges
  const clipId = await clipTile.getAttribute("data-photo-id");
  /* … publish as in the reorder test … */
  const res = await page.request.get(`/photos/${clipId}/video`, { headers: { Range: "bytes=0-99" } });
  expect(res.status()).toBe(206);
  /* cleanup: delete the post */
});
test("Retry after a failed clip upload doesn't compress again", async ({ page }) => {
  /* route abort only for **/video.mp4 PUTs on the first round → tile shows Retry; unroute; record stages via
     page.on('console') or a MutationObserver on the tile text; click Retry → "Done" without any "Compressing" text after the retry */
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test:e2e -- admin.spec.ts`. Expected: FAIL (the picker refuses video, or no clip tile appears).

- [ ] **Step 3: Implement the editor and tray changes per Interfaces**

- [ ] **Step 4: Run them and confirm they pass**

Run: `npm run test:e2e -- admin.spec.ts`. Expected: PASS, with every earlier admin test still green.

- [ ] **Step 5: Commit** with `feat: add clips in the editor`.

---

### Task 6: Clips for readers

**Files:**
- Modify: `src/components/feed/PostCard.tsx`, `src/components/feed/Lightbox.tsx`, `src/components/feed/feed.module.css`, `e2e/seed.setup.ts`, `e2e/feed.spec.ts`

**Interfaces:**
- Consumes: `PhotoView.kind`, `videoUrl` and `durationMs` (Task 1); `/photos/<id>/video` (Task 2); `makeClip` (Task 5).
- Produces:
  - **Feed tile:** a clip tile shows its poster thumb, a ▶ and a `m:ss` badge, with aria-label `Video N`. Tapping it opens the viewer at that clip.
  - **Viewer item:** `<video data-testid="clip" src={videoUrl} poster={displayUrl} controls playsinline preload="metadata">`. It pauses when the index changes or the view closes, and pointer events in its bottom 60 px don't count as swipes.
  - **Miniature row:** clip miniatures show a ▶ overlay.
  - **Seed:** "Auckland" gets one clip (`makeClip` 2 s, 640×360) as its third item, uploaded through the repo with `kind: 'video'`.

- [ ] **Step 1: Write the failing e2e tests**

```ts
test("a clip shows ▶ and its length, opens in the viewer, plays, and pauses when you move on", async ({ page }) => {
  const ids = seedIds();
  await page.goto(`/?post=${ids.auckland}`);
  const tile = page.locator(`#post-${ids.auckland}`).getByRole("button", { name: "Video 3" });
  await expect(tile).toContainText("0:02");
  await tile.click();
  const video = page.getByRole("dialog").getByTestId("clip");
  await expect(video).toHaveAttribute("src", /\/photos\/.+\/video$/);
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.3);
  await page.keyboard.press("ArrowLeft");
  /* back on the clip later: the earlier element was paused — assert via a window flag set in a 'pause' listener */
  await expect(page.getByRole("dialog").getByTestId("miniatures").getByText("▶")).toHaveCount(1);
});
test("a clip as the fifth tile keeps '+N' and its badge in the open grid", async () => {
  /* seed or reuse Museum X with a clip at position 6 → '+N' unchanged; open grid → that tile has '▶' and 'm:ss' */
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test:e2e -- feed.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the tile, viewer and miniature changes, and the seed clip**

- [ ] **Step 4: Run them and confirm they pass**

Run: `npm run test:e2e`. Expected: PASS (all specs).

- [ ] **Step 5: Commit** with `feat: show and play clips in the feed`.

---

### Task 7: Verification and notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the whole suite and the build**

Run: `npm run lint && npm test && npm run test:e2e && npm run build`, then `docker build -t prytz-nz .`. Expected: all pass.

- [ ] **Step 2: Test the migration on real Postgres**

Run the new image against a database at today's production schema with an existing post, as in the travel-days check. Expected: migrations go from 4 to 5, the existing photos are `kind = 'photo'`, and the post renders.

- [ ] **Step 3: Update the README**

- Under "Day-to-day", add how to add clips: same picker, up to 2 minutes, keep the page open while it compresses.
- Under "First-deploy checks", add a manual iPhone Safari check: open a post with a clip, play it, and scrub it.

- [ ] **Step 4: Commit** with `docs: clips in the README`.
