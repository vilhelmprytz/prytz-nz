import Link from "next/link";
import { requireAdminPage } from "@/auth/viewer";
import { AddSubscriberForm } from "@/components/admin/AddSubscriberForm";
import { getDb } from "@/db/client";
import { getEnv } from "@/env";
import { removeSubscriberAction, resubscribeAction } from "@/notify/actions";
import { groupSubscribers, listSubscribersForAdmin, type SubscriberView } from "@/notify/subscriber-admin";
import styles from "../../admin.module.css";

function Row({ person, action, label }: { person: SubscriberView; action: (formData: FormData) => Promise<void>; label: string }) {
  return (
    <li className={styles.subscriber}>
      <span className={styles.subscriberName}>{person.name || person.email}</span>
      <span className={styles.subscriberMeta}>
        {person.name ? `${person.email} · ` : ""}
        {person.note}
      </span>
      <form action={action}>
        <input type="hidden" name="id" value={person.id} />
        <button type="submit" className={styles.small}>
          {label}
        </button>
      </form>
    </li>
  );
}

/** Who gets new-post emails. Removing marks someone unsubscribed; nobody is deleted. */
export default async function SubscribersPage() {
  await requireAdminPage();
  const { count, subscribed, unsubscribed } = groupSubscribers(
    await listSubscribersForAdmin(getDb()),
    getEnv().ADMIN_EMAIL,
  );
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Subscribers</h1>
        <Link href="/admin" className={styles.link}>
          ← Posts
        </Link>
      </div>
      <p className={styles.muted}>
        {count} {count === 1 ? "gets" : "get"} new-post emails
      </p>
      <AddSubscriberForm />
      <ul className={styles.list} data-testid="subscribed">
        {subscribed.map((person) => (
          <Row key={person.id} person={person} action={removeSubscriberAction} label="Remove" />
        ))}
      </ul>
      {unsubscribed.length > 0 && (
        <>
          <h2 className={styles.subheading}>Unsubscribed</h2>
          <ul className={styles.list} data-testid="unsubscribed">
            {unsubscribed.map((person) => (
              <Row key={person.id} person={person} action={resubscribeAction} label="Turn back on" />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
