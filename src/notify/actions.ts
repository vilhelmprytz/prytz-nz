"use server";

import { refresh } from "next/cache";
import { assertAdmin } from "@/auth/viewer";
import { getDb } from "@/db/client";
import { getEnv } from "@/env";
import { createMailer } from "./smtp";
import {
  addSubscriberByAdmin,
  addSubscriberMessage,
  parseNewSubscriber,
  setSubscribedById,
} from "./subscriber-admin";
import { sendTestEmail, type TestEmailResult } from "./test-email";

/** The /admin "Send test email" button. Waits for the SMTP server's answer, because showing it is the point. */
export async function sendTestEmailAction(): Promise<TestEmailResult> {
  await assertAdmin();
  const env = getEnv();
  return sendTestEmail(createMailer(env), { from: env.SMTP_FROM ?? "", to: env.ADMIN_EMAIL });
}

/**
 * What the add form shows after a submit. The typed values come back so a refused address stays in the field;
 * `attempt` counts submits so the form can remount with them.
 */
export type AddSubscriberState = { ok: boolean; message: string; email: string; name: string; attempt: number } | null;

export async function addSubscriberAction(prev: AddSubscriberState, formData: FormData): Promise<AddSubscriberState> {
  await assertAdmin();
  const attempt = (prev?.attempt ?? 0) + 1;
  const email = formData.get("email")?.toString() ?? "";
  const name = formData.get("name")?.toString() ?? "";
  const input = parseNewSubscriber(email, name);
  if (!input) return { ok: false, message: addSubscriberMessage("invalid", email), email, name, attempt };
  const outcome = await addSubscriberByAdmin(getDb(), input);
  if (outcome === "added") refresh();
  return { ok: outcome === "added", message: addSubscriberMessage(outcome, input.email), email, name, attempt };
}

/** Marks someone unsubscribed by the admin. Sends nothing. */
export async function removeSubscriberAction(formData: FormData): Promise<void> {
  await assertAdmin();
  await setSubscribedById(getDb(), formData.get("id")?.toString() ?? "", false, new Date());
  refresh();
}

export async function resubscribeAction(formData: FormData): Promise<void> {
  await assertAdmin();
  await setSubscribedById(getDb(), formData.get("id")?.toString() ?? "", true, new Date());
  refresh();
}
