"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/auth/auth-client";
import styles from "../admin.module.css";

export function LoginPanel({ signedInEmail }: { signedInEmail: string | null }) {
  const router = useRouter();
  return (
    <div className={styles.stack}>
      {signedInEmail && <p>Signed in as {signedInEmail}, which can&apos;t post.</p>}
      <button
        type="button"
        className={styles.button}
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/admin" })}
      >
        Sign in with Google
      </button>
      {signedInEmail && (
        <button
          type="button"
          className={styles.secondary}
          onClick={async () => {
            await authClient.signOut();
            router.refresh();
          }}
        >
          Sign out
        </button>
      )}
    </div>
  );
}
