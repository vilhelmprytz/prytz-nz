import { expect, test } from "vitest";
import { unwrapLongitudes } from "./unwrap";

test("round-the-world trip goes west across the Pacific, never back over Europe", () => {
  const out = unwrapLongitudes([
    { lat: 59.33, lng: 18.07 },
    { lat: 34.05, lng: -118.24 },
    { lat: -36.85, lng: 174.76 },
    { lat: 1.35, lng: 103.82 },
    { lat: 59.33, lng: 18.07 },
  ]);
  expect(out.map((p) => Math.round(p.lng * 100) / 100)).toEqual([18.07, -118.24, -185.24, -256.18, -341.93]);
});

test("empty and single", () => {
  expect(unwrapLongitudes([])).toEqual([]);
  expect(unwrapLongitudes([{ lat: 1, lng: 2 }])).toEqual([{ lat: 1, lng: 2 }]);
});

test("keeps extra fields", () => {
  expect(unwrapLongitudes([{ lat: 0, lng: 170, id: "a" }, { lat: 0, lng: -170, id: "b" }])[1]).toEqual({
    lat: 0,
    lng: 190,
    id: "b",
  });
});
