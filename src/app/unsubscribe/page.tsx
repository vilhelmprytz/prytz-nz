import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { getSubscription } from "@/notify/subscribers";
import { parseUnsubscribeToken } from "@/notify/token";
import { SITE_TITLE } from "@/site";
import styles from "../unlock/unlock.module.css";
import { setSubscriptionAction } from "./actions";

export const metadata: Metadata = { title: "Mejl från prytz.nz" };

// Opening this page never changes anything (mail scanners open links); only the buttons do.
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const token = parseUnsubscribeToken((await searchParams).t);
  const subscription = token ? await getSubscription(getDb(), token) : null;

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{SITE_TITLE}</h1>
        {!token || !subscription ? (
          <p className={styles.subtitle}>Länken fungerar inte.</p>
        ) : (
          <form action={setSubscriptionAction} className={styles.form}>
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="subscribed" value={subscription.subscribed ? "0" : "1"} />
            <p>{subscription.subscribed ? "Vill du sluta få mejl om nya inlägg på prytz.nz?" : "Klart. Du får inga fler mejl om nya inlägg."}</p>
            <button type="submit" className={styles.button}>
              {subscription.subscribed ? "Sluta skicka mejl" : "Ångra"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
