import { REACTIONS, type Reaction } from "./emoji";

export type ReactionRow = { postId: string; emoji: Reaction; userId: string; name: string; createdAt: Date };
export type ReactionSummary = { emoji: Reaction; count: number; names: string[]; mine: boolean };

/** How the viewer's own reaction is named, first in the list. */
export const YOU = "Du";

/** Family members mostly share a surname, so first names read best. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Någon";

/** Used emoji in REACTIONS order; names earliest first, with the viewer as YOU up front. */
export function summarizeReactions(rows: ReactionRow[], viewerId: string | null): ReactionSummary[] {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return REACTIONS.flatMap((emoji) => {
    const forEmoji = sorted.filter((r) => r.emoji === emoji);
    if (forEmoji.length === 0) return [];
    const mine = forEmoji.some((r) => r.userId === viewerId);
    const others = forEmoji.filter((r) => r.userId !== viewerId).map((r) => firstName(r.name));
    return [{ emoji, count: forEmoji.length, names: mine ? [YOU, ...others] : others, mine }];
  });
}

/** "Mamma", "Mamma och Erik", "Mamma, Erik och Anna", "Mamma, Erik och 3 andra". */
export function formatReactors(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} och ${names.at(-1)}`;
  return `${names[0]}, ${names[1]} och ${names.length - 2} andra`;
}
