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
  [["Mamma"], "Mamma"],
  [["Mamma", "Erik"], "Mamma och Erik"],
  [["Mamma", "Erik", "Anna"], "Mamma, Erik och Anna"],
  [["Du", "Mamma", "Erik", "Anna", "Lisa"], "Du, Mamma och 3 andra"],
  [["Mamma", "Erik", "Anna", "Lisa"], "Mamma, Erik och 2 andra"],
])("%j → %s", (names, text) => {
  expect(formatReactors(names)).toBe(text);
});

test("summary: REACTIONS order, first names, viewer as Du first, mine flag", () => {
  const rows = [r("👍", "u1", "Erik Prytz", 1), r("❤️", "u2", "Mum", 2), r("❤️", "me", "Vilhelm Prytz", 3)];
  expect(summarizeReactions(rows, "me")).toEqual([
    { emoji: "❤️", count: 2, names: ["Du", "Mum"], mine: true },
    { emoji: "👍", count: 1, names: ["Erik"], mine: false },
  ]);
});

test("signed-out viewer sees names only", () => {
  expect(summarizeReactions([r("😂", "u1", "Anna Lind", 1)], null)).toEqual([
    { emoji: "😂", count: 1, names: ["Anna"], mine: false },
  ]);
});
