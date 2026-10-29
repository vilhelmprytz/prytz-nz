const LOCALITY_KEYS = ["city", "town", "village", "hamlet", "suburb", "municipality", "county"];

/**
 * A short place name from a Nominatim address: "Queenstown, New Zealand".
 * In the US the state reads better than the country: "San Francisco, California".
 */
export function formatPlaceName(address: Record<string, string> | undefined): string {
  if (!address) return "";
  const locality = LOCALITY_KEYS.map((k) => address[k]).find(Boolean);
  const { state, country } = address;
  const region = address.country_code === "us" ? state : country;
  // "Singapore, Singapore" → "Singapore"
  if (locality) return region && region !== locality ? `${locality}, ${region}` : locality;
  return [state, country].filter(Boolean).join(", ");
}
