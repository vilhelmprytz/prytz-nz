import { eq } from "drizzle-orm";
import { assertAdmin } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { posts } from "@/db/schema";
import { createPendingPhoto } from "@/posts/repo";
import { uploadRequestSchema } from "@/posts/upload-request";
import { getStorage } from "@/storage/storage";

/** Registers an upload and hands back presigned PUT URLs: both image sizes, plus the MP4 for a clip. */
export async function POST(request: Request) {
  try {
    await assertAdmin();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = uploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });

  const db = getDb();
  const [post] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, parsed.data.postId));
  if (!post) return Response.json({ error: "Post not found" }, { status: 404 });

  const meta = parsed.data.meta;
  const { photoId, displayKey, thumbKey, videoKey } = await createPendingPhoto(db, post.id, meta);
  const storage = getStorage();
  const [displayPutUrl, thumbPutUrl, videoPutUrl] = await Promise.all([
    storage.presignPut(displayKey, meta.contentType),
    storage.presignPut(thumbKey, meta.contentType),
    videoKey && meta.kind === "video" ? storage.presignPut(videoKey, meta.videoContentType) : undefined,
  ]);
  return Response.json({ photoId, displayPutUrl, thumbPutUrl, ...(videoPutUrl ? { videoPutUrl } : {}) });
}
