import { assertAdmin } from "@/auth/viewer";
import { getEnv } from "@/env";
import { formatPlaceName } from "@/geo/place-name";

const USER_AGENT = "prytz.nz travel journal (https://prytz.nz)";
const MIN_INTERVAL_MS = 1000; // Nominatim usage policy: at most one request per second.
let nextAllowedAt = 0;

async function throttle() {
  const now = Date.now();
  const waitMs = Math.max(0, nextAllowedAt - now);
  nextAllowedAt = Math.max(now, nextAllowedAt) + MIN_INTERVAL_MS;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

export async function GET(request: Request) {
  try {
    await assertAdmin();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const base = getEnv().NOMINATIM_URL;
  if (!base || !Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ placeName: "" });

  try {
    await throttle();
    const url = new URL("/reverse", base);
    url.search = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      zoom: "10",
      "accept-language": "en",
    }).toString();
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return Response.json({ placeName: "" });
    const data = (await res.json()) as { address?: Record<string, string> };
    return Response.json({ placeName: formatPlaceName(data.address) });
  } catch {
    return Response.json({ placeName: "" });
  }
}
