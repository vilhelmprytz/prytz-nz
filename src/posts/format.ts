const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** `2026-10-24T14:03:00` → `Fri 24 Oct`. The value is a wall clock, so format it as UTC to avoid any shift. */
export function formatPostDate(takenAtLocal: string): string {
  return dateFormat.format(new Date(`${takenAtLocal.slice(0, 19)}Z`)).replace(",", "");
}

/** A clip's length as shown on its tile: `0:08`, `1:02`. Never shows 0:00 for a real clip. */
export function formatDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
