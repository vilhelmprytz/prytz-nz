import { expect, test } from "vitest";
import { uploadRequestSchema } from "./upload-request";

const base = {
  contentType: "image/webp",
  width: 1920,
  height: 1080,
  takenAtLocal: null,
  utcOffset: null,
  lat: null,
  lng: null,
};
const POST = "11111111-1111-4111-8111-111111111111";
const clip = (extra: Record<string, unknown>) => ({
  postId: POST,
  meta: { ...base, kind: "video", videoContentType: "video/mp4", ...extra },
});

test("photo meta still parses; kind defaults to 'photo'", () => {
  const parsed = uploadRequestSchema.safeParse({ postId: POST, meta: base });
  expect(parsed.success).toBe(true);
  expect(parsed.success && parsed.data.meta.kind).toBe("photo");
});

test("clip meta needs durationMs ≤ 120000 and video/mp4", () => {
  expect(uploadRequestSchema.safeParse(clip({ durationMs: 8000 })).success).toBe(true);
  expect(uploadRequestSchema.safeParse(clip({ durationMs: 120_000 })).success).toBe(true);
  expect(uploadRequestSchema.safeParse(clip({ durationMs: 120_001 })).success).toBe(false);
  expect(uploadRequestSchema.safeParse(clip({ durationMs: 0 })).success).toBe(false);
  expect(uploadRequestSchema.safeParse(clip({ durationMs: 8000, videoContentType: "video/quicktime" })).success).toBe(false);
  expect(uploadRequestSchema.safeParse(clip({})).success).toBe(false);
});
