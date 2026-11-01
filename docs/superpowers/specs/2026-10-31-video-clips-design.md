# Video clips: design

Date: 2026-10-31
Status: reviewed by a builder (nothing open), awaiting Vilhelm's approval
Builds on: `docs/superpowers/specs/2026-10-27-travel-journal-design.md` (the site as built: gated feed, Leaflet map, R2 storage served through the app, phone-first editor).

## Why

Vilhelm wants to post short video clips alongside photos: panoramic views, moments at an event. Most clips are under 10 seconds and a few run up to a minute. He records in 4K on a Pixel.

The site is a side project and should stay free to run. Cloudflare Stream (about $5–6 a month) was rejected as too expensive. Clips are therefore compressed on the phone, in the browser, and stored in R2 next to the photos.

A throwaway test page proved the approach on Vilhelm's Pixel: it compressed his 4K clips to 1080p H.264 in Chrome, and the results played back fine ("It works fine!"). That page used Mediabunny 1.61.6 with the settings given below.

## What success looks like

- Vilhelm picks a mix of photos and clips from his phone in the editor. The clips are compressed on the phone and uploaded, with progress he can follow. A 10-second 4K clip ends up around 6 MB.
- Family scroll the feed, see a clip as a tile with a ▶ symbol and its length, tap it, and it plays full-screen with sound. Scrubbing works, including on iPhones.
- Nothing about clips costs money beyond R2's free tier for a trip's worth of clips.

## Anti-goals

- Clips playing by themselves, in the feed or in the viewer.
- A clip ever being a post's headline.
- Uploading the original 4K file. Only the compressed clip leaves the phone.
- Clips being reachable without the family password, or before their post is published (the same rules as photos).

## Non-goals

- Adaptive streaming, several quality levels, server-side transcoding, or any paid video service.
- Trimming, muting or otherwise editing clips.
- Reading location from video files. Phones don't store it reliably, so location stays photo GPS, the phone's location or pins.
- Clips longer than 2 minutes.
- HEVC/H.265 output: H.264 plays everywhere.

## Decided by Vilhelm

- Compression happens on the phone, in the browser, before upload. The test page confirmed it works on his Pixel.
- Readers tap a clip to play it. Nothing plays by itself.
- Clips sit among a post's photos, as part of the same set.
- A clip can't be the headline. The headline is always a photo.
- Clips are stored in R2 like photos, served through the app, and the site stays free.

## Reader experience

### In the feed

- A clip appears in the post's photo grid in its position in the post's order, as a tile showing its poster frame, a ▶ symbol, and its length (`0:08`, `1:02`).
- The "+N" count, the open grid ("Show fewer") and the "Photo N" labels count clips and photos together. Clip tiles are labelled "Video N" for screen readers.
- The headline at the top of the post is always a photo.

### In the full-screen view

- Clips and photos form one sequence: the ‹ › arrows, the keyboard arrows, swiping and the miniature row move through both. The counter (`5 / 12`) counts both.
- A clip shows its poster with the browser's own video controls (`controls`, `playsinline`, `preload="metadata"`). It starts only when the reader presses play, with sound.
- Leaving a clip (any navigation or closing the view) pauses it.
- Swiping on the video's own control bar (scrubbing) must not move to another item. Swiping elsewhere on the clip still moves between items. *(Claude's call: the bottom ~60px of the video, where the controls sit, ignores swipe navigation.)*
- In the miniature row, a clip's miniature shows its poster with a small ▶.

### Elsewhere

The map, the reactions and the unlock page are unchanged.

## Editor (admin, phone-first)

### Adding clips

- The existing **Add photos** picker also accepts videos (`accept="image/*,video/*"`). The label stays "Add photos" *(Claude's call: on Android, the picker shows clips alongside photos either way)*.
- Each clip gets a tile in the tray with these stages:
  1. `Reading…`
  2. `Compressing 40%`
  3. `Uploading 70%`
  4. `Finishing…`
  5. `Done`
  
  On failure the tile shows the same diagnostic style as photos, for example `Couldn't read this clip (compressing: EncodingError: …)`, plus Retry.
- Clips longer than 2 minutes are rejected straight away, with the tile showing `Clips can be at most 2 minutes`.
- **Concurrency:** at most one clip compresses at a time, because compression is the heavy part. Photos keep uploading two at a time alongside it. *(Claude's call.)*
  - Clips get their own one-at-a-time queue, so photos keep both of their upload slots.
  - Upload links are requested only after a clip finishes compressing, because the links expire after 15 minutes.
  - The compressed clip stays in memory, so Retry re-uploads it without compressing it again.
- **Screen lock:** while a clip is compressing, the editor asks the phone not to lock the screen (Screen Wake Lock), and tolerates being refused. The tile says `Keep this page open` while compressing. *(Claude's call.)*
- **Tray behaviour:** reordering, Remove and Retry work exactly as for photos. Clips have no ★, and only photos can be starred as headline.
- **Default headline:** without a starred photo, the default headline is the first **photo** in the post's order (clips are skipped).
- **Date:** the post's default date is the earliest capture date among its photos and clips. A clip's capture date is read from the file's metadata when present. *(Claude's call.)*
  - MP4 stores the creation time in UTC, but post dates are the local clock at the place. Convert it using the UTC offset of the post's photos, or the phone's current offset when no photo has one. *(Claude's call: this only matters when a clip is earlier than every photo, and the date stays editable.)*
- **Publishing** still requires a headline photo, so a post with only clips can't be published (the existing "Choose a headline photo" message).

### Compression settings (as tested on the Pixel)

- **Library:** Mediabunny, pinned to the version tested (1.61.6), installed from npm and bundled with the editor (not loaded from a CDN).
- **Video:** H.264 (`avc`) at about 5 Mbit/s. Scaled so the long edge is at most 1920px, keeping the aspect ratio, with both dimensions rounded to even numbers. Clips already that small are not upscaled.
- **Audio:** copied unchanged when the source is AAC; otherwise re-encoded to AAC.
- **Container:** MP4 with the index at the front (Mediabunny `fastStart: "in-memory"`), so playback can start before the whole file has loaded.
- **Poster:** one frame taken from about 0.5 s into the clip (or the first frame for shorter clips). It's encoded like a photo: a display size with a long edge of at most 1920 and a 640 thumbnail, WebP falling back to JPEG.
- **Size limit:** the compressed clip must be at most 150 MB (2 minutes at 5 Mbit/s is about 75 MB).

## Storage and serving

- **Data model:** clips are rows in the existing `photos` table, with:
  - a new `kind` column (`'photo' | 'video'`, default `'photo'`)
  - nullable `video_key`, `duration_ms` and `video_content_type` columns

  The poster uses the existing `display_key` and `thumb_key`, and its width and height are the clip's. *(Claude's call: one table keeps ordering, the gallery, the viewer and deletion working without a parallel set of code.)*
- **Migration:** existing rows become `kind = 'photo'`. The migration only adds columns, and runs at container start like the others.
- **R2 keys:** `photos/<uuid>/video.mp4`, next to `display.<ext>` and `thumb.<ext>` for the poster.
- **Upload:** three presigned PUTs (video, poster display, poster thumb) using the existing retry and stall logic. A 10-second clip is about 6 MB and 2 minutes about 75 MB, so a single PUT with retries is enough and no resumable multipart upload is needed. *(Claude's call.)* The completion check verifies all three objects, their content types and size limits, exactly as for photos.
- **Serving:** `GET /photos/<id>/video` streams the clip through the app with the same access rules as photos: gate cookie or admin, published post unless admin. It must support HTTP `Range` requests:
  - answer `206 Partial Content` with `Content-Range` and `Accept-Ranges: bytes`
  - pass the range through to R2 (`GetObject` with `Range`)

  Seeking needs this, and iOS Safari refuses to play video without it. Caching is the same as photos (`private, max-age=31536000, immutable`).
- **Deleting** a clip or its post removes the video object as well as the poster images.
  - That covers `deletePost`, `discardPhoto` and `cleanupStalePhotos` in `src/posts/repo.ts`.
  - `Storage.get` gains a byte-range option, implemented in both the R2 and local-folder drivers.
- **Clips must never become the headline.** Four places in the current code can make the first item the headline, and each must skip clips:
  - `completePhoto` in `src/posts/repo.ts`, which sets the headline with `coalesce` when an upload finishes
  - `removePhoto` in `src/posts/repo.ts`, which picks the next item as headline
  - `listFeedPage` in `src/posts/repo.ts`, which falls back to `own[0]`
  - the editor's rule on load (`PostEditor.tsx`), which treats a headline that isn't the first item as starred by hand
- **Feed API and types:** `PhotoView` gains `kind`, and for clips `videoUrl` and `durationMs`. The headline is always a photo.

## Constraints

- **Cost:** stays inside R2's free tier for a trip's worth of clips. There are no new paid services.
- **Production data:** the migration must work on the live database (one existing post with photos). Additive columns only.
- **Uploading needs WebCodecs** (Chrome on Android, desktop Chrome). If the browser can't encode H.264, the editor says so on the clip's tile and the photos still work.
- **Playback** uses plain H.264/AAC MP4 in a `<video>` element, which plays in every current browser.
- **The open batch-upload issue** (photos failing with `resizing: InvalidStateError` in large batches, diagnostics deployed) isn't solved yet. Clips add memory and CPU load, so the one-at-a-time rule matters. If the cause turns out to be memory, its fix applies to clips too.

## Left to the builder

- How the tray and viewer components branch on photo versus clip.
- Exactly how the poster frame is pulled from the clip, for example with Mediabunny's frame sinks on the compressed output.
- The test strategy. It should include:
  - the `Range` behaviour of the serve route (unit)
  - a clip uploaded, compressed and played in the e2e suite, with a small test clip generated or committed as a fixture. The Playwright Chromium here can encode and decode H.264 and encode AAC through WebCodecs, and can play MP4.
  - the migration on a database at today's schema
  - **iPhone playback:** WebKit isn't installed for the e2e suite, so this is covered by the `Range` unit test plus a manual check on a real iPhone after deploy.
- Minor UI copy and the layout of the ▶ symbol and duration badge, in the site's Postcard style.
