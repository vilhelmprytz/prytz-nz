import { assertAdmin } from "@/auth/viewer";
import { getEnv } from "@/env";
import { createFsStorage } from "@/storage/fs";

/** Stand-in for R2 presigned PUTs when STORAGE_DRIVER=fs (development and e2e only). */
export async function PUT(request: Request, { params }: RouteContext<"/api/dev-storage/[...key]">) {
  const env = getEnv();
  if (env.STORAGE_DRIVER !== "fs") return new Response("Not found", { status: 404 });
  try {
    await assertAdmin();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const { key } = await params;
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  await createFsStorage(env.FS_STORAGE_DIR).put(key.join("/"), new Uint8Array(await request.arrayBuffer()), contentType);
  return new Response(null, { status: 200 });
}
