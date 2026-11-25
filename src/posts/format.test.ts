import { expect, test } from "vitest";
import { formatDuration, formatPostDate } from "./format";

test("formats wall clock without shifting zones", () => {
  expect(formatPostDate("2026-10-24T23:59:00", "sv")).toBe("lör 24 okt");
  expect(formatPostDate("2026-11-01T00:30:00", "sv")).toBe("sön 1 nov");
  expect(formatPostDate("2026-05-01T12:00:00", "sv")).toBe("fre 1 maj");
});

test("the admin keeps English dates", () => {
  expect(formatPostDate("2026-10-24T23:59:00", "en")).toBe("Sat 24 Oct");
  expect(formatPostDate("2026-11-01T00:30:00", "en")).toBe("Sun 1 Nov");
});

test.each([
  [2000, "0:02"],
  [8400, "0:08"],
  [62_000, "1:02"],
  [120_000, "2:00"],
  [400, "0:01"],
])("formatDuration(%d) → %s", (ms, text) => {
  expect(formatDuration(ms)).toBe(text);
});
