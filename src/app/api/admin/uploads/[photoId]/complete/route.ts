import { assertAdmin } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { completePhoto } from "@/posts/repo";
import { getStorage } from "@/storage/storage";

export async function POST(_request: Request, { params }: RouteContext<"/api/admin/uploads/[photoId]/complete">) {
  try {
    await assertAdmin();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { photoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) return Response.json({ reason: "Upload not found" }, { status: 422 });
  const result = await completePhoto(getDb(), getStorage(), photoId);
  return result.ok
    ? Response.json({ photo: result.photo })
    : Response.json({ reason: result.reason }, { status: 422 });
}
