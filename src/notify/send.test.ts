import { eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { postEmailSubscribers, user } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import type { AnnouncedPost } from "./email";
import { sendNewPostEmails, type SendDeps } from "./send";
import type { Mailer, OutgoingEmail } from "./smtp";
import { addSubscriber, setSubscribed } from "./subscribers";

let db: Db;
const post: AnnouncedPost = {
  id: "p1",
  title: "Milford Sound",
  placeName: "Fiordland, New Zealand",
  takenAtLocal: "2026-11-14T10:00:00",
};

beforeEach(async () => {
  db = await createTestDb();
});

function fakeMailer(failFor: string[] = []) {
  const sent: OutgoingEmail[] = [];
  const close = vi.fn();
  const mailer: Mailer = {
    async send(email) {
      if (failFor.includes(email.to.address)) throw new Error("550 mailbox unavailable");
      sent.push(email);
    },
    verify: vi.fn(),
    close,
  };
  return { mailer, sent, close };
}

function deps(mailer: Mailer | null) {
  const log = { info: vi.fn(), error: vi.fn() };
  const d: SendDeps = {
    db,
    mailer,
    siteUrl: "https://prytz.nz",
    from: "prytz.nz <noreply@prytz.nz>",
    replyTo: "admin@example.com",
    log,
  };
  return { deps: d, log };
}

async function addUser(id: string, email: string, name: string, verified = true) {
  await db.insert(user).values({ id, name, email, emailVerified: verified });
  await addSubscriber(db, id);
}

test("one email per verified, subscribed recipient, with headers and reply-to", async () => {
  await addUser("a", "a@example.com", "Anna Svensson");
  await addUser("b", "b@example.com", "Bertil");
  await addUser("c", "c@example.com", "Cecilia", false);
  const [b] = await db.select().from(postEmailSubscribers).where(eq(postEmailSubscribers.userId, "b"));
  await setSubscribed(db, b.unsubscribeToken, false, new Date());
  const { mailer, sent, close } = fakeMailer();
  const { deps: d, log } = deps(mailer);

  const result = await sendNewPostEmails(d, post);

  expect(result).toEqual({ sent: 1, failed: 0 });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    to: { name: "Anna Svensson", address: "a@example.com" },
    from: "prytz.nz <noreply@prytz.nz>",
    replyTo: "admin@example.com",
    subject: "Nytt inlägg: Milford Sound",
    headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  expect(sent[0].text).toContain("Hej Anna!");
  expect(sent[0].html).toContain("Se inlägget");
  expect(sent[0].headers["List-Unsubscribe"]).toMatch(/^<https:\/\/prytz\.nz\/unsubscribe\/one-click\?t=[0-9a-f]{64}>$/);
  expect(close).toHaveBeenCalledTimes(1);
  expect(log.info).toHaveBeenCalledWith("[notify] post %s: sent %d, failed %d", "p1", 1, 0);
});

test("a failure for one recipient doesn't stop the rest, and its log has no address", async () => {
  await addUser("a", "a@example.com", "Anna");
  await addUser("b", "b@example.com", "Bertil");
  const { mailer, sent, close } = fakeMailer(["a@example.com"]);
  const { deps: d, log } = deps(mailer);

  const result = await sendNewPostEmails(d, post);

  expect(result).toEqual({ sent: 1, failed: 1 });
  expect(sent.map((e) => e.to.address)).toEqual(["b@example.com"]);
  expect(log.error).toHaveBeenCalledWith(
    "[notify] post %s: sending to user %s failed",
    "p1",
    "a",
    "550 mailbox unavailable",
  );
  expect(JSON.stringify(log.error.mock.calls)).not.toContain("@example.com");
  expect(close).toHaveBeenCalledTimes(1);
});

test("no SMTP → nothing sent, an info log, no throw", async () => {
  await addUser("a", "a@example.com", "Anna");
  const { deps: d, log } = deps(null);
  expect(await sendNewPostEmails(d, post)).toEqual({ sent: 0, failed: 0 });
  expect(log.info).toHaveBeenCalledWith("[notify] post %s: SMTP not configured, no emails sent", "p1");
});

test("an unexpected error is logged, not thrown, and the connection still closes", async () => {
  const { mailer, close } = fakeMailer();
  const { deps: d, log } = deps(mailer);
  const broken = { ...d, db: { select: () => { throw new Error("db down"); } } as unknown as Db };
  expect(await sendNewPostEmails(broken, post)).toEqual({ sent: 0, failed: 0 });
  expect(log.error).toHaveBeenCalledWith("[notify] post %s: sending failed", "p1", expect.any(Error));
  expect(close).toHaveBeenCalledTimes(1);
});

test("an SMTP error that quotes the address is logged without it", async () => {
  await addUser("a", "a@example.com", "Anna");
  const mailer: Mailer = {
    async send() {
      throw new Error("550 5.1.1 <a@example.com>: Recipient address rejected");
    },
    verify: vi.fn(),
    close: vi.fn(),
  };
  const { deps: d, log } = deps(mailer);
  expect(await sendNewPostEmails(d, post)).toEqual({ sent: 0, failed: 1 });
  const logged = JSON.stringify(log.error.mock.calls, (_k, v) => (v instanceof Error ? v.message : v));
  expect(logged).toContain("Recipient address rejected");
  expect(logged).not.toContain("a@example.com");
});
