import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { postEmailSubscribers, user } from "@/db/schema";
import { personColumns, type SubscriberSource } from "./subscribers";

const s = postEmailSubscribers;

/** The admin's add form: trimmed, the address lowercased. null unless the address looks real. */
export function parseNewSubscriber(email: string, name: string): { email: string; name: string } | null {
  const parsed = z.email().safeParse(email.trim().toLowerCase());
  return parsed.success ? { email: parsed.data, name: name.trim() } : null;
}

export type AddOutcome = "added" | "already-subscribed" | "already-unsubscribed";

/**
 * Adds a typed address (already through `parseNewSubscriber`). An address that is already on the list, typed or as a
 * verified sign-in, is left as it is. An address that belongs to a verified sign-in not on the list is linked to it.
 */
export async function addSubscriberByAdmin(db: Db, input: { email: string; name: string }): Promise<AddOutcome> {
  const accountMatches = and(eq(user.emailVerified, true), sql`lower(${user.email}) = ${input.email}`);
  const [existing] = await db
    .select({ unsubscribedAt: s.unsubscribedAt })
    .from(s)
    .leftJoin(user, eq(user.id, s.userId))
    .where(or(eq(s.email, input.email), accountMatches))
    .limit(1);
  if (existing) return existing.unsubscribedAt ? "already-unsubscribed" : "already-subscribed";

  const [account] = await db.select({ id: user.id }).from(user).where(accountMatches).limit(1);
  const inserted = await db
    .insert(s)
    .values({ email: input.email, name: input.name, source: "admin", userId: account?.id ?? null })
    .onConflictDoNothing()
    .returning({ id: s.id });
  // Lost a race with another add or a reaction: it's on the list either way.
  return inserted.length > 0 ? "added" : "already-subscribed";
}

export function addSubscriberMessage(outcome: AddOutcome | "invalid", email: string): string {
  switch (outcome) {
    case "added":
      return `Added ${email}.`;
    case "already-subscribed":
      return `${email} is already on the list.`;
    case "already-unsubscribed":
      return `${email} is on the list but unsubscribed. Use Turn back on below.`;
    case "invalid":
      return "That isn't an email address.";
  }
}

/** Remove (keeps an earlier unsubscribe by the person themself as it was) or turn back on. Sends nothing. */
export async function setSubscribedById(db: Db, id: string, subscribed: boolean, now: Date): Promise<void> {
  if (subscribed) {
    await db.update(s).set({ unsubscribedAt: null, unsubscribedBy: null }).where(eq(s.id, id));
  } else {
    await db
      .update(s)
      .set({ unsubscribedAt: now, unsubscribedBy: "admin" })
      .where(and(eq(s.id, id), isNull(s.unsubscribedAt)));
  }
}

export type AdminSubscriberRow = {
  id: string;
  email: string;
  name: string;
  source: SubscriberSource;
  verified: boolean;
  unsubscribedAt: Date | null;
  unsubscribedBy: "self" | "admin" | null;
};

export async function listSubscribersForAdmin(db: Db): Promise<AdminSubscriberRow[]> {
  return db
    .select({
      ...personColumns,
      source: s.source,
      verified: sql<boolean>`(${s.userId} is null or coalesce(${user.emailVerified}, false))`,
      unsubscribedAt: s.unsubscribedAt,
      unsubscribedBy: s.unsubscribedBy,
    })
    .from(s)
    .leftJoin(user, eq(user.id, s.userId));
}

export type SubscriberView = { id: string; name: string; email: string; note: string };

const unsubscribedDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function subscribedNote(row: AdminSubscriberRow, adminEmail: string): string {
  if (!row.verified) return "gets no email (unverified)";
  if (row.email.toLowerCase() === adminEmail.trim().toLowerCase()) return "you";
  return row.source === "admin" ? "added by you" : "reacted";
}

/** The /admin/subscribers page's two lists and its count. */
export function groupSubscribers(
  rows: AdminSubscriberRow[],
  adminEmail: string,
): { count: number; subscribed: SubscriberView[]; unsubscribed: SubscriberView[] } {
  const view = (row: AdminSubscriberRow, note: string): SubscriberView => ({
    id: row.id,
    name: row.name,
    email: row.email,
    note,
  });
  const subscribed = rows
    .filter((r) => !r.unsubscribedAt)
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "en", { sensitivity: "base" }));
  const unsubscribed = rows
    .filter((r): r is AdminSubscriberRow & { unsubscribedAt: Date } => r.unsubscribedAt !== null)
    .sort((a, b) => b.unsubscribedAt.getTime() - a.unsubscribedAt.getTime());
  return {
    count: subscribed.filter((r) => r.verified).length,
    subscribed: subscribed.map((r) => view(r, subscribedNote(r, adminEmail))),
    unsubscribed: unsubscribed.map((r) =>
      view(r, `${r.unsubscribedBy === "admin" ? "removed by you" : "themselves"}, ${unsubscribedDate.format(r.unsubscribedAt)}`),
    ),
  };
}
