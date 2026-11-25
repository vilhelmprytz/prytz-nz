import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { postEmailSubscribers, user } from "@/db/schema";

export type SubscriberSource = "reaction" | "admin";

/** One row on the list, resolved to where its email goes. `id` is the list row's id. */
export type Person = { id: string; email: string; name: string };
export type Recipient = Person & { source: SubscriberSource; unsubscribeToken: string };
export type SubscriptionChange = { changed: boolean; person: Person };

const s = postEmailSubscribers;

/**
 * Where a row's email goes: the account's current address once there is a sign-in, else the typed one. A name the
 * admin typed wins over the account's name (they know what their relatives like to be called).
 */
export const personColumns = {
  id: s.id,
  email: sql<string>`coalesce(${user.email}, ${s.email})`,
  name: sql<string>`coalesce(nullif(${s.name}, ''), ${user.name}, '')`,
};

/** Typed addresses are vouched for by the admin; sign-ins count only with a verified address. */
export const canReceive = or(isNull(s.userId), eq(user.emailVerified, true));

/**
 * Puts someone who signed in on the list. An existing row, subscribed or not, is left alone. A typed address that
 * matches their verified email becomes their row, so they never get two copies.
 */
export async function addSubscriber(db: Db, userId: string): Promise<void> {
  const [existing] = await db.select({ id: s.id }).from(s).where(eq(s.userId, userId));
  if (existing) return;
  const [account] = await db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId));
  if (account?.emailVerified) {
    const linked = await db
      .update(s)
      .set({ userId })
      .where(and(eq(s.email, account.email.trim().toLowerCase()), isNull(s.userId)))
      .returning({ id: s.id });
    if (linked.length > 0) return;
  }
  await db.insert(s).values({ userId }).onConflictDoNothing();
}

/** Everyone who gets the next new-post email. */
export async function listRecipients(db: Db): Promise<Recipient[]> {
  return db
    .select({ ...personColumns, source: s.source, unsubscribeToken: s.unsubscribeToken })
    .from(s)
    .leftJoin(user, eq(user.id, s.userId))
    .where(and(isNull(s.unsubscribedAt), canReceive))
    .orderBy(asc(s.subscribedAt), asc(s.id));
}

export async function getSubscription(db: Db, token: string): Promise<{ subscribed: boolean } | null> {
  const [row] = await db.select({ unsubscribedAt: s.unsubscribedAt }).from(s).where(eq(s.unsubscribeToken, token));
  return row ? { subscribed: row.unsubscribedAt === null } : null;
}

/**
 * The /unsubscribe page and one-click: the person themself. `changed` is false when they were already in that state
 * (mail apps can send one-click twice). null for an unknown token.
 */
export async function setSubscribed(
  db: Db,
  token: string,
  subscribed: boolean,
  now: Date,
): Promise<SubscriptionChange | null> {
  const flipped = await db
    .update(s)
    .set(subscribed ? { unsubscribedAt: null, unsubscribedBy: null } : { unsubscribedAt: now, unsubscribedBy: "self" })
    .where(and(eq(s.unsubscribeToken, token), subscribed ? sql`${s.unsubscribedAt} is not null` : isNull(s.unsubscribedAt)))
    .returning({ id: s.id });
  const [person] = await db
    .select(personColumns)
    .from(s)
    .leftJoin(user, eq(user.id, s.userId))
    .where(eq(s.unsubscribeToken, token));
  return person ? { changed: flipped.length > 0, person } : null;
}
