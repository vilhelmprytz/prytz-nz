import type { PhotoMeta } from "@/posts/types";

export type PostDefaults = PhotoMeta & { locationSource: "headline" | "other" | null };

/** Date from the earliest photo; location from the headline, else the first other photo that has GPS. */
export function pickPostDefaults(photos: PhotoMeta[], headlineIndex: number): PostDefaults {
  const dated = photos.filter((p) => p.takenAtLocal).sort((a, b) => a.takenAtLocal!.localeCompare(b.takenAtLocal!));
  const earliest = dated[0];
  const hasGps = (p: PhotoMeta | undefined) => p !== undefined && p.lat !== null && p.lng !== null;
  const headline = photos[headlineIndex];
  const other = photos.find((p, i) => i !== headlineIndex && hasGps(p));
  const located = hasGps(headline) ? headline : other;
  return {
    takenAtLocal: earliest?.takenAtLocal ?? null,
    utcOffset: earliest?.utcOffset ?? null,
    lat: located?.lat ?? null,
    lng: located?.lng ?? null,
    locationSource: hasGps(headline) ? "headline" : other ? "other" : null,
  };
}
