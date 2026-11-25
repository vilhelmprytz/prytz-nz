import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { postEmailSubscribers, user } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import {
  addSubscriberByAdmin,
  addSubscriberMessage,
  groupSubscribers,
  listSubscribersForAdmin,
  parseNewSubscriber,
  setSubscribedById,
  type AdminSubscriberRow,
} from "./subscriber-admin";
import { addSubscriber, setSubscribed } from "./subscribers";

let db: Db;
const NOW = new Date("2026-11-23T12:00:00Z");

beforeEach(async () => {
  db = await createTestDb();
});

const rows = () => db.select().from(postEmailSubscribers);
const byEmail = async (email: string) =>
  (await db.select().from(postEmailSubscribers).where(eq(postEmailSubscribers.email, email)))[0];

test("parseNewSubscriber trims and lowercases; rejects non-addresses", () => {
  expect(parseNewSubscriber(" Anna@Example.SE ", " Anna ")).toEqual({ email: "anna@example.se", name: "Anna" });
  expect(parseNewSubscriber("a@b", "")).toBeNull();
  expect(parseNewSubscriber("", "")).toBeNull();
  expect(parseNewSubscriber("not an address", "Anna")).toBeNull();
});

test("add: new address → added; same address in other case → already-subscribed", async () => {
  expect(await addSubscriberByAdmin(db, { email: "anna@example.se", name: "Anna" })).toBe("added");
  expect(await byEmail("anna@example.se")).toMatchObject({ name: "Anna", source: "admin", userId: null, unsubscribedAt: null });
  const again = parseNewSubscriber("ANNA@example.se ", "")!;
  expect(await addSubscriberByAdmin(db, again)).toBe("already-subscribed");
  expect(await rows()).toHaveLength(1);
});

test("add: an address that is a verified account already on the list → already-subscribed, no new row", async () => {
  await db.insert(user).values({ id: "e", name: "Erik", email: "Erik@Gmail.com", emailVerified: true });
  await addSubscriber(db, "e");
  expect(await addSubscriberByAdmin(db, { email: "erik@gmail.com", name: "Erik" })).toBe("already-subscribed");
  expect(await rows()).toHaveLength(1);
});

test("add: an address that is a verified account not on the list → row linked to that user, source 'admin'", async () => {
  await db.insert(user).values({ id: "e", name: "Erik", email: "erik@gmail.com", emailVerified: true });
  expect(await addSubscriberByAdmin(db, { email: "erik@gmail.com", name: "Morbror Erik" })).toBe("added");
  expect(await rows()).toMatchObject([{ userId: "e", email: "erik@gmail.com", name: "Morbror Erik", source: "admin" }]);
  // Reacting later finds the same row.
  await addSubscriber(db, "e");
  expect(await rows()).toHaveLength(1);
});

test("add: an address that matches only an unverified account → a separate typed row", async () => {
  await db.insert(user).values({ id: "u", name: "Unverified", email: "u@example.com", emailVerified: false });
  await addSubscriber(db, "u");
  expect(await addSubscriberByAdmin(db, { email: "u@example.com", name: "" })).toBe("added");
  expect(await byEmail("u@example.com")).toMatchObject({ userId: null, source: "admin" });
  expect(await rows()).toHaveLength(2);
});

test("add: an unsubscribed row → already-unsubscribed, nothing changes", async () => {
  await addSubscriberByAdmin(db, { email: "anna@example.se", name: "Anna" });
  const anna = await byEmail("anna@example.se");
  await setSubscribedById(db, anna.id, false, NOW);
  expect(await addSubscriberByAdmin(db, { email: "anna@example.se", name: "Anna" })).toBe("already-unsubscribed");
  expect(await byEmail("anna@example.se")).toMatchObject({ unsubscribedAt: NOW, unsubscribedBy: "admin" });
});

test("remove marks 'admin'; turn back on clears; removing a self-unsubscribed row keeps 'self' and its date", async () => {
  await addSubscriberByAdmin(db, { email: "anna@example.se", name: "Anna" });
  const anna = await byEmail("anna@example.se");

  await setSubscribedById(db, anna.id, false, NOW);
  expect(await byEmail("anna@example.se")).toMatchObject({ unsubscribedAt: NOW, unsubscribedBy: "admin" });
  await setSubscribedById(db, anna.id, true, NOW);
  expect(await byEmail("anna@example.se")).toMatchObject({ unsubscribedAt: null, unsubscribedBy: null });

  await setSubscribed(db, anna.unsubscribeToken, false, NOW);
  await setSubscribedById(db, anna.id, false, new Date("2026-11-24T12:00:00Z"));
  expect(await byEmail("anna@example.se")).toMatchObject({ unsubscribedAt: NOW, unsubscribedBy: "self" });
});

test("a removed person stays off after reacting", async () => {
  await db.insert(user).values({ id: "e", name: "Erik", email: "erik@gmail.com", emailVerified: true });
  await addSubscriber(db, "e");
  const [erik] = await rows();
  await setSubscribedById(db, erik.id, false, NOW);
  await addSubscriber(db, "e");
  expect(await rows()).toMatchObject([{ id: erik.id, unsubscribedAt: NOW, unsubscribedBy: "admin" }]);
});

test("listSubscribersForAdmin resolves addresses, names and verification", async () => {
  await db.insert(user).values([
    { id: "e", name: "Erik", email: "erik@gmail.com", emailVerified: true },
    { id: "u", name: "Test", email: "test@e2e.test", emailVerified: false },
  ]);
  await addSubscriber(db, "e");
  await addSubscriber(db, "u");
  await addSubscriberByAdmin(db, { email: "anna@example.se", name: "Anna" });
  const list = await listSubscribersForAdmin(db);
  const by = Object.fromEntries(list.map((r) => [r.email, r]));
  expect(by["erik@gmail.com"]).toMatchObject({ name: "Erik", source: "reaction", verified: true, unsubscribedAt: null });
  expect(by["test@e2e.test"]).toMatchObject({ verified: false });
  expect(by["anna@example.se"]).toMatchObject({ name: "Anna", source: "admin", verified: true, unsubscribedBy: null });
});

test("groupSubscribers: notes, order, count", () => {
  const row = (r: Partial<AdminSubscriberRow> & Pick<AdminSubscriberRow, "id" | "email">): AdminSubscriberRow => ({
    name: "",
    source: "reaction",
    verified: true,
    unsubscribedAt: null,
    unsubscribedBy: null,
    ...r,
  });
  const grouped = groupSubscribers(
    [
      row({ id: "r", email: "erik@gmail.com", name: "Erik" }),
      row({ id: "u", email: "test@e2e.test", name: "Test", verified: false }),
      row({ id: "t", email: "anna@example.se", name: "Anna", source: "admin" }),
      row({ id: "me", email: "Admin@Example.com", name: "Vilhelm" }),
      row({ id: "s", email: "karin@example.se", name: "Karin", unsubscribedAt: new Date("2026-11-03T10:00:00Z"), unsubscribedBy: "self" }),
      row({ id: "a", email: "olle@example.se", name: "Olle", unsubscribedAt: new Date("2026-11-05T10:00:00Z"), unsubscribedBy: "admin" }),
      row({ id: "l", email: "legacy@example.se", unsubscribedAt: new Date("2026-11-01T10:00:00Z") }),
    ],
    "admin@example.com",
  );
  expect(grouped.count).toBe(3);
  expect(grouped.subscribed).toEqual([
    { id: "t", name: "Anna", email: "anna@example.se", note: "added by you" },
    { id: "r", name: "Erik", email: "erik@gmail.com", note: "reacted" },
    { id: "u", name: "Test", email: "test@e2e.test", note: "gets no email (unverified)" },
    { id: "me", name: "Vilhelm", email: "Admin@Example.com", note: "you" },
  ]);
  expect(grouped.unsubscribed).toEqual([
    { id: "a", name: "Olle", email: "olle@example.se", note: "removed by you, 5 Nov 2026" },
    { id: "s", name: "Karin", email: "karin@example.se", note: "themselves, 3 Nov 2026" },
    { id: "l", name: "", email: "legacy@example.se", note: "themselves, 1 Nov 2026" },
  ]);
});

test("addSubscriberMessage copy, exactly", () => {
  expect(addSubscriberMessage("added", "anna@example.se")).toBe("Added anna@example.se.");
  expect(addSubscriberMessage("already-subscribed", "anna@example.se")).toBe("anna@example.se is already on the list.");
  expect(addSubscriberMessage("already-unsubscribed", "anna@example.se")).toBe(
    "anna@example.se is on the list but unsubscribed. Use Turn back on below.",
  );
  expect(addSubscriberMessage("invalid", "")).toBe("That isn't an email address.");
});
