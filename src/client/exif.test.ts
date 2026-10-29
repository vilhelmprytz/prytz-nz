import { expect, test } from "vitest";
import { summarizeExif } from "./exif";

test("reads wall clock, offset and GPS", () => {
  expect(
    summarizeExif({ DateTimeOriginal: "2026:10:24 14:03:11", OffsetTimeOriginal: "+13:00" }, { latitude: -45.03, longitude: 168.66 }),
  ).toEqual({ takenAtLocal: "2026-10-24T14:03:11", utcOffset: "+13:00", lat: -45.03, lng: 168.66 });
});

test("falls back to CreateDate / OffsetTime", () => {
  expect(summarizeExif({ CreateDate: "2026:10:24 09:00:00", OffsetTime: "-07:00" }, undefined)).toEqual({
    takenAtLocal: "2026-10-24T09:00:00",
    utcOffset: "-07:00",
    lat: null,
    lng: null,
  });
});

test("nothing → all null", () => {
  expect(summarizeExif(undefined, undefined)).toEqual({ takenAtLocal: null, utcOffset: null, lat: null, lng: null });
});

test.each([[{ latitude: 0, longitude: 0 }], [{ latitude: NaN, longitude: 1 }], [{ latitude: 91, longitude: 1 }]])(
  "bad GPS %j → null",
  (g) => {
    expect(summarizeExif(undefined, g).lat).toBeNull();
  },
);

test("garbage date → null", () => {
  expect(summarizeExif({ DateTimeOriginal: "0000:00:00 00:00:00" }, undefined).takenAtLocal).toBeNull();
});
