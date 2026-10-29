"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getEnv } from "@/env";
import { clientIp, rateLimitKey } from "@/gate/client-ip";
import { safeNextPath } from "@/gate/paths";
import { attemptUnlock } from "@/gate/rate-limit";
import { createGateToken, GATE_COOKIE, GATE_MAX_AGE_S } from "@/gate/token";

export type UnlockState = { error?: string };

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function unlock(_prev: UnlockState, formData: FormData): Promise<UnlockState> {
  const env = getEnv();
  const db = getDb();
  const ip = clientIp(await headers(), env.TRUSTED_PROXY_HOPS);
  const key = rateLimitKey(ip);
  console.info("[unlock] ip=%s key=%s", ip, key);

  const now = new Date();
  const password = String(formData.get("password") ?? "");
  const ok = timingSafeEqual(digest(password), digest(env.FAMILY_PASSWORD));
  const result = await attemptUnlock(db, key, ok, now);
  if (result === "locked") return { error: "Too many tries. Try again in 15 minutes." };
  if (result === "wrong") return { error: "That's not the password." };

  (await cookies()).set(GATE_COOKIE, createGateToken(now.getTime(), env.FAMILY_PASSWORD, env.BETTER_AUTH_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.BETTER_AUTH_URL.startsWith("https://"),
    path: "/",
    maxAge: GATE_MAX_AGE_S,
  });
  redirect(safeNextPath(formData.get("next")?.toString()));
}
