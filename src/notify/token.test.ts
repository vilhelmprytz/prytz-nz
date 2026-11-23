import { expect, test } from "vitest";
import { parseUnsubscribeToken } from "./token";

test.each([
  ["a".repeat(64), "a".repeat(64)],
  ["0123456789abcdef".repeat(4), "0123456789abcdef".repeat(4)],
  ["A".repeat(64), null],
  ["a".repeat(63), null],
  ["a".repeat(65), null],
  ["g".repeat(64), null],
  [` ${"a".repeat(64)}`, null],
  [["a".repeat(64), "b".repeat(64)], null],
  [undefined, null],
  [null, null],
  ["", null],
])("parse %j", (input, expected) => {
  expect(parseUnsubscribeToken(input)).toBe(expected);
});
