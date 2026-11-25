import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { postEmailSubscribers, user } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { addSubscriber, getSubscription, listRecipients, setSubscribed } from "./subscribers";

let db: Db;
const NOW = new Date("2026-11-23T12:00:00Z");

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(user).values([
    { id: "a", name: "Anna Svensson", email: "a@example.com", emailVerified: true },
    { id: "b", name: "Bertil", email: "b@example.com", emailVerified: true },
    { id: "c", name: "Cecilia", email: "c@example.com", emailVerified: false },
  ]);
});

async function rowOf(userId: string) {
  const [row] = await db.select().from(postEmailSubscribers).where(eq(postEmailSubscribers.userId, userId));
  return row;
}

async function tokenOf(userId: string): Promise<string> {
  return (await rowOf(userId)).unsubscribeToken;
}

async function addTyped(email: string, name: string) {
  const [row] = await db.insert(postEmailSubscribers).values({ email, name, source: "admin" }).returning();
  return row;
}

test("adding twice keeps one row and the same token", async () => {
  await addSubscriber(db, "a");
  const token = await tokenOf("a");
  await addSubscriber(db, "a");
  const rows = await db.select().from(postEmailSubscribers);
  expect(rows).toHaveLength(1);
  expect(rows[0].unsubscribeToken).toBe(token);
});

test("recipients: verified and subscribed only", async () => {
  for (const id of ["a", "b", "c"]) await addSubscriber(db, id);
  await setSubscribed(db, await tokenOf("b"), false, NOW);
  const recipients = await listRecipients(db);
  expect(recipients).toEqual([
    {
      id: (await rowOf("a")).id,
      email: "a@example.com",
      name: "Anna Svensson",
      source: "reaction",
      unsubscribeToken: await tokenOf("a"),
    },
  ]);
});

test("unsubscribe sticks when the person is added again; undo resubscribes", async () => {
  await addSubscriber(db, "a");
  const token = await tokenOf("a");
  expect(await getSubscription(db, token)).toEqual({ subscribed: true });
  expect(await setSubscribed(db, token, false, NOW)).toMatchObject({ changed: true });
  expect(await getSubscription(db, token)).toEqual({ subscribed: false });
  await addSubscriber(db, "a");
  expect(await getSubscription(db, token)).toEqual({ subscribed: false });
  expect(await setSubscribed(db, token, true, NOW)).toMatchObject({ changed: true });
  expect(await getSubscription(db, token)).toEqual({ subscribed: true });
  expect((await listRecipients(db)).map((r) => r.email)).toEqual(["a@example.com"]);
});

test("unknown token: getSubscription → null, setSubscribed → null", async () => {
  const unknown = "0".repeat(64);
  expect(await getSubscription(db, unknown)).toBeNull();
  expect(await setSubscribed(db, unknown, false, NOW)).toBeNull();
});

test("a typed address is a recipient, with its typed name and source 'admin'", async () => {
  const row = await addTyped("anna@example.se", "Anna");
  expect(await listRecipients(db)).toEqual([
    { id: row.id, email: "anna@example.se", name: "Anna", source: "admin", unsubscribeToken: row.unsubscribeToken },
  ]);
});

test("reacting with a matching verified address links the typed row instead of adding one", async () => {
  const typed = await addTyped("anna@example.se", "Mormor Anna");
  await db.insert(user).values({ id: "g", name: "Anna Google", email: "Anna@Example.se", emailVerified: true });
  await addSubscriber(db, "g");
  const rows = await db.select().from(postEmailSubscribers);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: typed.id, userId: "g", unsubscribeToken: typed.unsubscribeToken, source: "admin" });
  expect(await listRecipients(db)).toEqual([
    { id: typed.id, email: "Anna@Example.se", name: "Mormor Anna", source: "admin", unsubscribeToken: typed.unsubscribeToken },
  ]);
});

test("an unverified account is never linked", async () => {
  await addTyped("anna@example.se", "Anna");
  await db.insert(user).values({ id: "g", name: "Anna Google", email: "anna@example.se", emailVerified: false });
  await addSubscriber(db, "g");
  expect(await db.select().from(postEmailSubscribers)).toHaveLength(2);
  expect((await listRecipients(db)).map((r) => r.name)).toEqual(["Anna"]);
});

test("an unsubscribed typed row stays unsubscribed after linking", async () => {
  const typed = await addTyped("anna@example.se", "Anna");
  await setSubscribed(db, typed.unsubscribeToken, false, NOW);
  await db.insert(user).values({ id: "g", name: "Anna Google", email: "anna@example.se", emailVerified: true });
  await addSubscriber(db, "g");
  expect(await rowOf("g")).toMatchObject({ id: typed.id, unsubscribedAt: NOW, unsubscribedBy: "self" });
  expect(await listRecipients(db)).toEqual([]);
});

test("the account's name is used when no name was typed", async () => {
  await addTyped("a@example.com", "");
  await addSubscriber(db, "a");
  expect((await listRecipients(db)).map((r) => r.name)).toEqual(["Anna Svensson"]);
});

test("setSubscribed reports whether anything changed", async () => {
  await addSubscriber(db, "a");
  const row = await rowOf("a");
  const person = { id: row.id, email: "a@example.com", name: "Anna Svensson" };

  expect(await setSubscribed(db, row.unsubscribeToken, false, NOW)).toEqual({ changed: true, person });
  expect(await rowOf("a")).toMatchObject({ unsubscribedAt: NOW, unsubscribedBy: "self" });

  const later = new Date("2026-11-24T12:00:00Z");
  expect(await setSubscribed(db, row.unsubscribeToken, false, later)).toEqual({ changed: false, person });
  expect(await rowOf("a")).toMatchObject({ unsubscribedAt: NOW, unsubscribedBy: "self" });

  expect(await setSubscribed(db, row.unsubscribeToken, true, later)).toEqual({ changed: true, person });
  expect(await rowOf("a")).toMatchObject({ unsubscribedAt: null, unsubscribedBy: null });
  expect(await setSubscribed(db, row.unsubscribeToken, true, later)).toEqual({ changed: false, person });
});
