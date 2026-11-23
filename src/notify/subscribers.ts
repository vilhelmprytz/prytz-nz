import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { postEmailSubscribers, user } from "@/db/schema";

export type Recipient = { userId: string; email: string; name: string; unsubscribeToken: string };

/** Puts someone on the new-post email list. An existing row, subscribed or not, is left alone. */
export async function addSubscriber(db: Db, userId: string): Promise<void> {
  await db.insert(postEmailSubscribers).values({ userId }).onConflictDoNothing();
}

/** Subscribed people with a verified email address (Google sign-ins are always verified). */
export async function listRecipients(db: Db): Promise<Recipient[]> {
  return db
    .select({
      userId: postEmailSubscribers.userId,
      email: user.email,
      name: user.name,
      unsubscribeToken: postEmailSubscribers.unsubscribeToken,
    })
    .from(postEmailSubscribers)
    .innerJoin(user, eq(user.id, postEmailSubscribers.userId))
    .where(and(isNull(postEmailSubscribers.unsubscribedAt), eq(user.emailVerified, true)))
    .orderBy(postEmailSubscribers.subscribedAt, postEmailSubscribers.userId);
}

export async function getSubscription(db: Db, token: string): Promise<{ subscribed: boolean } | null> {
  const [row] = await db
    .select({ unsubscribedAt: postEmailSubscribers.unsubscribedAt })
    .from(postEmailSubscribers)
    .where(eq(postEmailSubscribers.unsubscribeToken, token));
  return row ? { subscribed: row.unsubscribedAt === null } : null;
}

/** Returns false for an unknown token. */
export async function setSubscribed(db: Db, token: string, subscribed: boolean, now: Date): Promise<boolean> {
  const rows = await db
    .update(postEmailSubscribers)
    .set({ unsubscribedAt: subscribed ? null : now })
    .where(eq(postEmailSubscribers.unsubscribeToken, token))
    .returning({ userId: postEmailSubscribers.userId });
  return rows.length > 0;
}
