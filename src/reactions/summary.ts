import { REACTIONS, type Reaction } from "./emoji";

export type ReactionRow = { postId: string; emoji: Reaction; userId: string; name: string; createdAt: Date };
export type ReactionSummary = { emoji: Reaction; count: number; names: string[]; mine: boolean };

/** Family members mostly share a surname, so first names read best. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Someone";

/** Used emoji in REACTIONS order; names earliest first, with the viewer as "You" up front. */
export function summarizeReactions(rows: ReactionRow[], viewerId: string | null): ReactionSummary[] {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return REACTIONS.flatMap((emoji) => {
    const forEmoji = sorted.filter((r) => r.emoji === emoji);
    if (forEmoji.length === 0) return [];
    const mine = forEmoji.some((r) => r.userId === viewerId);
    const others = forEmoji.filter((r) => r.userId !== viewerId).map((r) => firstName(r.name));
    return [{ emoji, count: forEmoji.length, names: mine ? ["You", ...others] : others, mine }];
  });
}

/** "Mum", "Mum and Erik", "Mum, Erik and Anna", "Mum, Erik and 3 others". */
export function formatReactors(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}
