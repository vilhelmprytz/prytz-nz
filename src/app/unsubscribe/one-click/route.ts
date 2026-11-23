import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { setSubscribed } from "@/notify/subscribers";
import { parseUnsubscribeToken } from "@/notify/token";

/** RFC 8058 one-click unsubscribe, sent by mail apps. Same answer for every token, so it reveals nothing. */
export async function POST(request: NextRequest) {
  const token = parseUnsubscribeToken(request.nextUrl.searchParams.get("t"));
  if (token) await setSubscribed(getDb(), token, false, new Date());
  return new Response(null, { status: 200 });
}

/** Someone opened the header link in a browser: show the page, which changes nothing until they press its button. */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(`/unsubscribe${request.nextUrl.search}`, request.url), 303);
}
