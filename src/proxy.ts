import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/env";
import { classifyPath } from "@/gate/paths";
import { GATE_COOKIE, verifyGateToken } from "@/gate/token";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (classifyPath(pathname) !== "reader") return NextResponse.next();

  const env = getEnv();
  const token = request.cookies.get(GATE_COOKIE)?.value;
  if (verifyGateToken(token, Date.now(), env.FAMILY_PASSWORD, env.BETTER_AUTH_SECRET)) return NextResponse.next();

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
