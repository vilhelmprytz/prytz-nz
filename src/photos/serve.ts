import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { photos, posts } from "@/db/schema";
import type { Storage } from "@/storage/types";
import { parseRange } from "./range";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new Response("Not found", { status: 404 });
const CACHE = "private, max-age=31536000, immutable";
const SIZES = new Set(["display", "thumb", "video"]);

/**
 * Photos and clips are only ever served through here: readers need the family cookie and a published post.
 * Clips (`size: "video"`) honour `Range`, which seeking needs and iOS Safari requires before it plays at all.
 */
export async function servePhoto(
  deps: { db: Db; storage: Storage },
  req: { photoId: string; size: string; hasGate: boolean; isAdmin: boolean; range?: string | null },
): Promise<Response> {
  if (!req.hasGate && !req.isAdmin) return Response.json({ error: "locked" }, { status: 401 });
  if (!UUID.test(req.photoId) || !SIZES.has(req.size)) return notFound();

  const [row] = await deps.db
    .select({
      displayKey: photos.displayKey,
      thumbKey: photos.thumbKey,
      videoKey: photos.videoKey,
      photoStatus: photos.status,
      postStatus: posts.status,
    })
    .from(photos)
    .innerJoin(posts, eq(posts.id, photos.postId))
    .where(eq(photos.id, req.photoId));
  if (!row || row.photoStatus !== "ready") return notFound();
  if (row.postStatus !== "published" && !req.isAdmin) return notFound();

  if (req.size === "video") return serveVideo(deps.storage, row.videoKey, req.range ?? null);

  const object = await deps.storage.get(req.size === "display" ? row.displayKey : row.thumbKey);
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.size),
      "Cache-Control": CACHE,
    },
  });
}

async function serveVideo(storage: Storage, key: string | null, rangeHeader: string | null): Promise<Response> {
  if (!key) return notFound();
  const info = await storage.head(key);
  if (!info) return notFound();
  const range = parseRange(rangeHeader, info.size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
  }
  const object = await storage.get(key, range ?? undefined);
  if (!object) return notFound();
  const headers: Record<string, string> = {
    "Content-Type": object.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": CACHE,
  };
  if (!range) return new Response(object.body, { headers: { ...headers, "Content-Length": String(object.size) } });
  return new Response(object.body, {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${range.start}-${range.end}/${object.size}`,
      "Content-Length": String(range.end - range.start + 1),
    },
  });
}
