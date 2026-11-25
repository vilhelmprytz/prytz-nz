import type { Lang } from "@/site";

const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" };
const dateFormats: Record<Lang, Intl.DateTimeFormat> = {
  sv: new Intl.DateTimeFormat("sv-SE", options),
  en: new Intl.DateTimeFormat("en-GB", options),
};

/**
 * `2026-10-24T14:03:00` → `lör 24 okt` (sv) or `Sat 24 Oct` (en). The value is a wall clock, so format it as UTC
 * to avoid any shift. The abbreviation's dot goes: the date is shown in capitals, where `OKT.` reads oddly.
 */
export function formatPostDate(takenAtLocal: string, lang: Lang): string {
  return dateFormats[lang].format(new Date(`${takenAtLocal.slice(0, 19)}Z`)).replace(/[,.]/g, "");
}

/** A clip's length as shown on its tile: `0:08`, `1:02`. Never shows 0:00 for a real clip. */
export function formatDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
