import { expect, test } from "vitest";
import { formatPlaceName } from "./place-name";

test.each([
  [{ town: "Queenstown", state: "Otago", country: "New Zealand", country_code: "nz" }, "Queenstown, New Zealand"],
  [{ city: "San Francisco", state: "California", country: "United States", country_code: "us" }, "San Francisco, California"],
  [{ village: "Lake Tekapo", country: "New Zealand", country_code: "nz" }, "Lake Tekapo, New Zealand"],
  [{ state: "Tasman", country: "New Zealand", country_code: "nz" }, "Tasman, New Zealand"],
  [{ country: "Singapore", country_code: "sg" }, "Singapore"],
  [undefined, ""],
])("%j → %s", (a, out) => {
  expect(formatPlaceName(a)).toBe(out);
});
