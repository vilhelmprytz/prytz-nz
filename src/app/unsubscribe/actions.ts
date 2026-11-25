"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { getDb } from "@/db/client";
import { getEnv } from "@/env";
import { noticeDepsFromEnv, sendUnsubscribeNotice } from "@/notify/admin-notices";
import { setSubscribed } from "@/notify/subscribers";
import { parseUnsubscribeToken } from "@/notify/token";

/** The token is the only authorization: this page works without the family password or a sign-in. */
export async function setSubscriptionAction(formData: FormData): Promise<never> {
  const token = parseUnsubscribeToken(formData.get("t")?.toString());
  if (!token) redirect("/unsubscribe");
  const subscribed = formData.get("subscribed") === "1";
  const change = await setSubscribed(getDb(), token, subscribed, new Date());
  // Before redirect(), which throws. Only a real change emails the admin.
  if (!subscribed && change?.changed) after(() => sendUnsubscribeNotice(noticeDepsFromEnv(getEnv()), change.person));
  redirect(`/unsubscribe?t=${token}`);
}
