import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { photos, posts } from "@/db/schema";
import type { Storage } from "@/storage/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new Response("Not found", { status: 404 });

/** Photos are only ever served through here: readers need the family cookie and a published post. */
export async function servePhoto(
  deps: { db: Db; storage: Storage },
  req: { photoId: string; size: string; hasGate: boolean; isAdmin: boolean },
): Promise<Response> {
  if (!req.hasGate && !req.isAdmin) return Response.json({ error: "locked" }, { status: 401 });
  if (!UUID.test(req.photoId) || (req.size !== "display" && req.size !== "thumb")) return notFound();

  const [row] = await deps.db
    .select({
      displayKey: photos.displayKey,
      thumbKey: photos.thumbKey,
      photoStatus: photos.status,
      postStatus: posts.status,
    })
    .from(photos)
    .innerJoin(posts, eq(posts.id, photos.postId))
    .where(eq(photos.id, req.photoId));
  if (!row || row.photoStatus !== "ready") return notFound();
  if (row.postStatus !== "published" && !req.isAdmin) return notFound();

  const object = await deps.storage.get(req.size === "display" ? row.displayKey : row.thumbKey);
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.size),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
