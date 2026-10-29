"use client";

import { useActionState } from "react";
import { unlock } from "./actions";
import styles from "./unlock.module.css";

export function UnlockForm({ next }: { next: string }) {
  // The permalink keeps the error visible when the form is submitted before hydration (slow phones).
  const permalink = `/unlock?next=${encodeURIComponent(next)}`;
  const [state, action, pending] = useActionState(unlock, {}, permalink);
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="password" className={styles.label}>
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        className={styles.input}
      />
      <button type="submit" disabled={pending} className={styles.button}>
        Open
      </button>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
    </form>
  );
}
