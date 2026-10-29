import "server-only";
import { cookies, headers } from "next/headers";
import { getViewer } from "@/auth/viewer";
import { getEnv } from "@/env";
import { GATE_COOKIE, verifyGateToken } from "./token";

export async function hasGateCookie(): Promise<boolean> {
  const env = getEnv();
  const token = (await cookies()).get(GATE_COOKIE)?.value;
  return verifyGateToken(token, Date.now(), env.FAMILY_PASSWORD, env.BETTER_AUTH_SECRET);
}

export async function readerAccess(): Promise<{ hasGate: boolean; isAdmin: boolean }> {
  const [hasGate, viewer] = await Promise.all([hasGateCookie(), getViewer(await headers())]);
  return { hasGate, isAdmin: viewer.isAdmin };
}

/** Server actions are POSTs to page routes; check access inside them rather than trusting the proxy alone. */
export async function assertReader(): Promise<void> {
  const { hasGate, isAdmin } = await readerAccess();
  if (!hasGate && !isAdmin) throw new Error("Forbidden");
}
