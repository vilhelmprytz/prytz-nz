import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  canEncodeVideo,
} from "mediabunny";
import { UploadFailedError } from "./upload-errors";

export const CLIP_MAX_EDGE = 1920;
export const CLIP_BITRATE = 5_000_000;
export const CLIP_MAX_MS = 120_000;
const POSTER_AT_S = 0.5;

export type CompressedClip = { blob: Blob; width: number; height: number; durationMs: number };

/** Fits a clip inside CLIP_MAX_EDGE on its long side, never upscaling; H.264 needs even dimensions. */
export function fitClip(width: number, height: number, maxEdge = CLIP_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  return { width: even(width * scale), height: even(height * scale) };
}

const OFFSET = /^([+-])(\d{2}):(\d{2})$/;

/**
 * MP4 stores the creation time in UTC; posts use the wall clock at the place. `offset` is the post's photos'
 * UTC offset; without one, the phone's own offset at that moment is used.
 */
export function clipTakenAtLocal(utc: Date | null, offset: string | null): string | null {
  if (!utc || Number.isNaN(utc.getTime())) return null;
  const m = offset ? OFFSET.exec(offset) : null;
  const offsetMinutes = m
    ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
    : -utc.getTimezoneOffset();
  return new Date(utc.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 19);
}

/** The phone's own UTC offset at `date`, as `+HH:MM`. */
export function localOffset(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function checkClipLength(durationMs: number): void {
  if (durationMs > CLIP_MAX_MS) throw new UploadFailedError("Clips can be at most 2 minutes");
}

export async function ensureVideoEncoding(): Promise<void> {
  const message = "This browser can't compress video. Use Chrome on your phone.";
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") throw new UploadFailedError(message);
  if (!(await canEncodeVideo("avc", { width: 1920, height: 1080, bitrate: CLIP_BITRATE }))) {
    throw new UploadFailedError(message);
  }
}

export async function readClipInfo(
  file: Blob,
): Promise<{ durationMs: number; width: number; height: number; takenAtUtc: Date | null }> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new UploadFailedError("This file has no video in it.");
  const [duration, tags] = await Promise.all([input.computeDuration(), input.getMetadataTags().catch(() => ({}))]);
  const date = (tags as { date?: Date }).date;
  return {
    durationMs: Math.round(duration * 1000),
    width: track.displayWidth,
    height: track.displayHeight,
    takenAtUtc: date instanceof Date && !Number.isNaN(date.getTime()) ? date : null,
  };
}

/** 1080p H.264 at about 5 Mbit/s, the settings tested on the Pixel. AAC audio is copied; anything else becomes AAC. */
export function clipConversionOptions(size: { width: number; height: number }) {
  return {
    video: { codec: "avc" as const, ...size, fit: "fill" as const, bitrate: CLIP_BITRATE },
    audio: { codec: "aac" as const },
  };
}

type Discarded = { track: { type: string }; reason: string };

/** A conversion that would drop the picture or the sound fails with the reason, instead of uploading a broken clip. */
export function checkConversion(isValid: boolean, discarded: Discarded[]): void {
  const dropped = discarded.filter((d) => d.reason !== "discarded_by_user");
  if (!isValid || dropped.length > 0) {
    const reasons = dropped.map((d) => `${d.track.type}: ${d.reason}`).join(", ") || "unknown reason";
    throw new UploadFailedError(`Can't compress this clip here (${reasons})`);
  }
}

export async function compressClip(file: Blob, onProgress: (fraction: number) => void): Promise<CompressedClip> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new UploadFailedError("This file has no video in it.");
  const size = fitClip(track.displayWidth, track.displayHeight);
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const conversion = await Conversion.init({ input, output, ...clipConversionOptions(size) });
  checkConversion(conversion.isValid, conversion.discardedTracks);
  conversion.onProgress = (progress) => onProgress(progress);
  await conversion.execute();
  if (!target.buffer) throw new UploadFailedError("Compressing produced no file.");
  const duration = await input.computeDuration();
  return { blob: new Blob([target.buffer], { type: "video/mp4" }), ...size, durationMs: Math.round(duration * 1000) };
}

/** A still from 0.5 s in (or the first frame of a shorter clip), as an image to resize like a photo. */
export async function posterFrame(clip: Blob): Promise<Blob> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(clip) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new UploadFailedError("This file has no video in it.");
  const sink = new CanvasSink(track);
  const duration = await input.computeDuration();
  const first = await track.getFirstTimestamp();
  const wrapped = (await sink.getCanvas(duration >= 1 ? POSTER_AT_S : first)) ?? (await sink.getCanvas(first));
  if (!wrapped) throw new UploadFailedError("Couldn't take a still from this clip.");
  const { canvas } = wrapped;
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the still"))), "image/png"),
  );
}
