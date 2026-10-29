import { expect, test } from "vitest";
import type { PhotoMeta } from "@/posts/types";
import { pickPostDefaults } from "./post-defaults";

const m = (t: string | null, lat: number | null = null, lng: number | null = null): PhotoMeta => ({
  takenAtLocal: t,
  utcOffset: null,
  lat,
  lng,
});

test("earliest date, headline location", () => {
  expect(pickPostDefaults([m("2026-10-24T15:00:00", 1, 2), m("2026-10-24T09:00:00", 3, 4)], 0)).toMatchObject({
    takenAtLocal: "2026-10-24T09:00:00",
    lat: 1,
    lng: 2,
    locationSource: "headline",
  });
});

test("headline without GPS → first other with GPS", () => {
  expect(pickPostDefaults([m(null, 3, 4), m(null)], 1)).toMatchObject({ lat: 3, lng: 4, locationSource: "other" });
});

test("no data at all", () => {
  expect(pickPostDefaults([m(null), m(null)], 0)).toEqual({
    takenAtLocal: null,
    utcOffset: null,
    lat: null,
    lng: null,
    locationSource: null,
  });
});
