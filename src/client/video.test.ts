import { afterEach, expect, test, vi } from "vitest";
import { checkClipLength, checkConversion, clipConversionOptions, clipTakenAtLocal, ensureVideoEncoding, fitClip } from "./video";

afterEach(() => {
  vi.unstubAllGlobals();
});

test.each([
  [3840, 2160, { width: 1920, height: 1080 }],
  [2160, 3840, { width: 1080, height: 1920 }],
  [1280, 720, { width: 1280, height: 720 }],
  [4000, 3001, { width: 1920, height: 1440 }],
  [1081, 607, { width: 1080, height: 606 }],
])("fitClip(%d, %d)", (w, h, out) => {
  expect(fitClip(w, h)).toEqual(out);
});

test("clipTakenAtLocal converts UTC to the place's clock", () => {
  expect(clipTakenAtLocal(new Date("2026-11-02T20:15:00Z"), "+13:00")).toBe("2026-11-03T09:15:00");
  expect(clipTakenAtLocal(new Date("2026-10-18T19:00:00Z"), "-07:00")).toBe("2026-10-18T12:00:00");
  expect(clipTakenAtLocal(null, "+13:00")).toBeNull();
});

test("clipTakenAtLocal without an offset uses the phone's own", () => {
  const utc = new Date("2026-11-02T20:15:00Z");
  const local = new Date(utc.getTime() - utc.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
  expect(clipTakenAtLocal(utc, null)).toBe(local);
});

test("checkClipLength allows 2:00 and rejects longer", () => {
  expect(() => checkClipLength(120_000)).not.toThrow();
  expect(() => checkClipLength(120_001)).toThrow("Clips can be at most 2 minutes");
});

test("ensureVideoEncoding fails clearly without WebCodecs", async () => {
  vi.stubGlobal("VideoEncoder", undefined);
  await expect(ensureVideoEncoding()).rejects.toThrow("This browser can't compress video");
});

test("clips get H.264 video and AAC audio (copied when the source is already AAC)", () => {
  expect(clipConversionOptions({ width: 1920, height: 1080 })).toEqual({
    video: { codec: "avc", width: 1920, height: 1080, fit: "fill", bitrate: 5_000_000 },
    audio: { codec: "aac" },
  });
});

test("a clip that would lose its sound or picture fails instead of uploading silently", () => {
  expect(() => checkConversion(true, [])).not.toThrow();
  expect(() => checkConversion(true, [{ track: { type: "audio" }, reason: "no_encodable_target_codec" }])).toThrow(
    "Can't compress this clip here (audio: no_encodable_target_codec)",
  );
  expect(() => checkConversion(false, [{ track: { type: "video" }, reason: "undecodable_source_codec" }])).toThrow(
    "Can't compress this clip here (video: undecodable_source_codec)",
  );
});
