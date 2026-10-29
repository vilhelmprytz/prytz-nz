import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertAdmin } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { posts } from "@/db/schema";
import { createPendingPhoto } from "@/posts/repo";
import { getStorage } from "@/storage/storage";

const nullableNumber = (min: number, max: number) => z.number().min(min).max(max).nullable();

const body = z.object({
  postId: z.uuid(),
  meta: z.object({
    contentType: z.enum(["image/webp", "image/jpeg"]),
    width: z.number().int().positive().max(20_000),
    height: z.number().int().positive().max(20_000),
    takenAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/).nullable(),
    utcOffset: z.string().regex(/^[+-]\d{2}:\d{2}$/).nullable(),
    lat: nullableNumber(-90, 90),
    lng: nullableNumber(-180, 180),
  }),
});

/** Registers an upload and hands back presigned PUT URLs for both sizes. */
export async function POST(request: Request) {
  try {
    await assertAdmin();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });

  const db = getDb();
  const [post] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, parsed.data.postId));
  if (!post) return Response.json({ error: "Post not found" }, { status: 404 });

  const { photoId, displayKey, thumbKey } = await createPendingPhoto(db, post.id, parsed.data.meta);
  const storage = getStorage();
  const [displayPutUrl, thumbPutUrl] = await Promise.all([
    storage.presignPut(displayKey, parsed.data.meta.contentType),
    storage.presignPut(thumbKey, parsed.data.meta.contentType),
  ]);
  return Response.json({ photoId, displayPutUrl, thumbPutUrl });
}
