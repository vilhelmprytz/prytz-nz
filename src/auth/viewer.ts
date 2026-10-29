import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/env";
import { isAdminUser } from "./admin";
import { getAuth } from "./auth";

export { isAdminUser };

export type ViewerUser = { id: string; name: string; email: string; emailVerified: boolean };
export type Viewer = { user: ViewerUser | null; isAdmin: boolean };

export async function getViewer(requestHeaders: Headers): Promise<Viewer> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  const user = session
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
      }
    : null;
  return { user, isAdmin: isAdminUser(user, getEnv().ADMIN_EMAIL) };
}

export async function requireAdminPage(): Promise<ViewerUser> {
  const viewer = await getViewer(await headers());
  if (!viewer.isAdmin || !viewer.user) redirect("/admin/login");
  return viewer.user;
}

export async function assertAdmin(): Promise<ViewerUser> {
  const viewer = await getViewer(await headers());
  if (!viewer.isAdmin || !viewer.user) throw new Error("Forbidden");
  return viewer.user;
}
