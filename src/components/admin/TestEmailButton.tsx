"use client";

import { useActionState } from "react";
import styles from "@/app/admin/admin.module.css";
import { sendTestEmailAction } from "@/notify/actions";
import type { TestEmailResult } from "@/notify/test-email";

/** Emails only the admin, to check the SMTP settings without emailing readers. */
export function TestEmailButton() {
  const [state, action, pending] = useActionState<TestEmailResult | null>(sendTestEmailAction, null);
  return (
    <form action={action} className={styles.testEmail}>
      <button type="submit" className={styles.secondary} disabled={pending}>
        {pending ? "Sending…" : "Send test email"}
      </button>
      {state && (
        <p role="status" className={state.ok ? styles.muted : styles.errorText}>
          {state.message}
        </p>
      )}
    </form>
  );
}
