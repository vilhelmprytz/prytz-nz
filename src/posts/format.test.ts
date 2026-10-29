import { expect, test } from "vitest";
import { formatPostDate } from "./format";

test("formats wall clock without shifting zones", () => {
  expect(formatPostDate("2026-10-24T23:59:00")).toBe("Sat 24 Oct");
  expect(formatPostDate("2026-11-01T00:30:00")).toBe("Sun 1 Nov");
});
