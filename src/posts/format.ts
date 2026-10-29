const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** `2026-10-24T14:03:00` → `Fri 24 Oct`. The value is a wall clock, so format it as UTC to avoid any shift. */
export function formatPostDate(takenAtLocal: string): string {
  return dateFormat.format(new Date(`${takenAtLocal.slice(0, 19)}Z`)).replace(",", "");
}
