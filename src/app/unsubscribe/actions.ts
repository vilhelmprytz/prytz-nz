"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { setSubscribed } from "@/notify/subscribers";
import { parseUnsubscribeToken } from "@/notify/token";

/** The token is the only authorization: this page works without the family password or a sign-in. */
export async function setSubscriptionAction(formData: FormData): Promise<never> {
  const token = parseUnsubscribeToken(formData.get("t")?.toString());
  if (!token) redirect("/unsubscribe");
  await setSubscribed(getDb(), token, formData.get("subscribed") === "1", new Date());
  redirect(`/unsubscribe?t=${token}`);
}
