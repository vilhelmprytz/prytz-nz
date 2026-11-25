"use client";

import { useActionState } from "react";
import styles from "@/app/admin/admin.module.css";
import { addSubscriberAction, type AddSubscriberState } from "@/notify/actions";

/** Adds someone by address, for relatives who asked to be told but won't sign in with Google. */
export function AddSubscriberForm() {
  const [state, action, pending] = useActionState<AddSubscriberState, FormData>(addSubscriberAction, null);
  // React resets the form after each submit; a refused address comes back from the state, a new key re-applies it.
  const keep = state && !state.ok ? state : null;
  return (
    <form action={action} className={styles.addForm} key={state?.attempt ?? 0}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Name (optional)</span>
        <input name="name" autoComplete="off" defaultValue={keep?.name ?? ""} className={styles.input} />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Email</span>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          required
          defaultValue={keep?.email ?? ""}
          className={styles.input}
        />
      </label>
      <button type="submit" className={styles.button} disabled={pending}>
        Add
      </button>
      {state && (
        <p role="status" className={state.ok ? styles.muted : styles.errorText}>
          {state.message}
        </p>
      )}
    </form>
  );
}
