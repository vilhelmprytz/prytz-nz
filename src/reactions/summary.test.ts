import { expect, test } from "vitest";
import type { Reaction } from "./emoji";
import { formatReactors, summarizeReactions, type ReactionRow } from "./summary";

const r = (emoji: Reaction, userId: string, name: string, minute: number): ReactionRow => ({
  postId: "p",
  emoji,
  userId,
  name,
  createdAt: new Date(Date.UTC(2026, 9, 27, 12, minute)),
});

test.each([
  [["Mum"], "Mum"],
  [["Mum", "Erik"], "Mum and Erik"],
  [["Mum", "Erik", "Anna"], "Mum, Erik and Anna"],
  [["You", "Mum", "Erik", "Anna", "Lisa"], "You, Mum and 3 others"],
  [["Mum", "Erik", "Anna", "Lisa"], "Mum, Erik and 2 others"],
])("%j → %s", (names, text) => {
  expect(formatReactors(names)).toBe(text);
});

test("summary: REACTIONS order, first names, viewer as You first, mine flag", () => {
  const rows = [r("👍", "u1", "Erik Prytz", 1), r("❤️", "u2", "Mum", 2), r("❤️", "me", "Vilhelm Prytz", 3)];
  expect(summarizeReactions(rows, "me")).toEqual([
    { emoji: "❤️", count: 2, names: ["You", "Mum"], mine: true },
    { emoji: "👍", count: 1, names: ["Erik"], mine: false },
  ]);
});

test("signed-out viewer sees names only", () => {
  expect(summarizeReactions([r("😂", "u1", "Anna Lind", 1)], null)).toEqual([
    { emoji: "😂", count: 1, names: ["Anna"], mine: false },
  ]);
});
