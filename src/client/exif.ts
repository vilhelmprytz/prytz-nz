import exifr from "exifr";
import type { PhotoMeta } from "@/posts/types";

type DateTags = { DateTimeOriginal?: string; CreateDate?: string; OffsetTimeOriginal?: string; OffsetTime?: string };

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const OFFSET = /^[+-]\d{2}:\d{2}$/;

function parseExifDate(value: string | undefined): string | null {
  const m = value ? EXIF_DATE.exec(value.trim()) : null;
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

function validGps(gps: { latitude: number; longitude: number } | undefined) {
  if (!gps) return null;
  const { latitude: lat, longitude: lng } = gps;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null; // "null island": a camera with no fix
  return { lat, lng };
}

export function summarizeExif(tags: DateTags | undefined, gps: { latitude: number; longitude: number } | undefined): PhotoMeta {
  const original = parseExifDate(tags?.DateTimeOriginal);
  const takenAtLocal = original ?? parseExifDate(tags?.CreateDate);
  const offset = original ? tags?.OffsetTimeOriginal : tags?.OffsetTime;
  const position = validGps(gps);
  return {
    takenAtLocal,
    utcOffset: takenAtLocal && offset && OFFSET.test(offset) ? offset : null,
    lat: position?.lat ?? null,
    lng: position?.lng ?? null,
  };
}

/** Must run on the original file: resizing through a canvas drops all EXIF. */
export async function readPhotoMeta(file: Blob): Promise<PhotoMeta> {
  try {
    const [tags, gps] = await Promise.all([
      exifr.parse(file, {
        pick: ["DateTimeOriginal", "CreateDate", "OffsetTimeOriginal", "OffsetTime"],
        reviveValues: false,
      }) as Promise<DateTags | undefined>,
      exifr.gps(file).catch(() => undefined),
    ]);
    return summarizeExif(tags, gps ?? undefined);
  } catch {
    return summarizeExif(undefined, undefined);
  }
}
