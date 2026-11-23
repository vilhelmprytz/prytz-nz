"use server";

import { assertAdmin } from "@/auth/viewer";
import { getEnv } from "@/env";
import { createMailer } from "./smtp";
import { sendTestEmail, type TestEmailResult } from "./test-email";

/** The /admin "Send test email" button. Waits for the SMTP server's answer, because showing it is the point. */
export async function sendTestEmailAction(): Promise<TestEmailResult> {
  await assertAdmin();
  const env = getEnv();
  return sendTestEmail(createMailer(env), { from: env.SMTP_FROM ?? "", to: env.ADMIN_EMAIL });
}
