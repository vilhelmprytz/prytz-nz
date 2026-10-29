import { headers } from "next/headers";
import { getViewer } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { hasGateCookie } from "@/gate/access";
import { servePhoto } from "@/photos/serve";
import { getStorage } from "@/storage/storage";

export async function GET(_request: Request, { params }: RouteContext<"/photos/[photoId]/[size]">) {
  const { photoId, size } = await params;
  const [hasGate, viewer] = await Promise.all([hasGateCookie(), getViewer(await headers())]);
  return servePhoto({ db: getDb(), storage: getStorage() }, { photoId, size, hasGate, isAdmin: viewer.isAdmin });
}
