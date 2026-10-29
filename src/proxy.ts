import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminUser } from "@/auth/admin";
import { getAuth } from "@/auth/auth";
import { getEnv } from "@/env";
import { classifyPath } from "@/gate/paths";
import { GATE_COOKIE, verifyGateToken } from "@/gate/token";

async function isAdminRequest(request: NextRequest, adminEmail: string): Promise<boolean> {
  if (!getSessionCookie(request)) return false;
  const session = await getAuth().api.getSession({ headers: request.headers });
  return isAdminUser(session?.user ?? null, adminEmail);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (classifyPath(pathname) !== "reader") return NextResponse.next();

  const env = getEnv();
  const token = request.cookies.get(GATE_COOKIE)?.value;
  if (verifyGateToken(token, Date.now(), env.FAMILY_PASSWORD, env.BETTER_AUTH_SECRET)) return NextResponse.next();
  if (await isAdminRequest(request, env.ADMIN_EMAIL)) return NextResponse.next();

  if (pathname.startsWith("/photos/") || pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const unlock = new URL("/unlock", request.url);
  unlock.searchParams.set("next", pathname + search);
  return NextResponse.redirect(unlock);
}

export const config = {
  // Next internals (/_next/*, dev-only /__nextjs*) are never gated; they carry no journal content.
  matcher: ["/((?!_next/|__nextjs|favicon.ico).*)"],
};
