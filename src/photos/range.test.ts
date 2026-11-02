import { expect, test } from "vitest";
import { parseRange } from "./range";

test.each([
  ["bytes=0-99", 1000, { start: 0, end: 99 }],
  ["bytes=900-", 1000, { start: 900, end: 999 }],
  ["bytes=-100", 1000, { start: 900, end: 999 }],
  ["bytes=0-5000", 1000, { start: 0, end: 999 }],
  ["bytes=-5000", 1000, { start: 0, end: 999 }],
  [null, 1000, null],
  ["bytes=0-1,5-9", 1000, null],
  ["items=0-9", 1000, null],
  ["bytes=9-3", 1000, null],
  ["bytes=1000-", 1000, "unsatisfiable"],
  ["bytes=-0", 1000, "unsatisfiable"],
] as const)("parseRange(%s, %d)", (header, size, out) => {
  expect(parseRange(header, size)).toEqual(out);
});
