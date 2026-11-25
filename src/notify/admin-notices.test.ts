import { beforeEach, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { posts } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import {
  buildReactionNotice,
  buildUnsubscribeNotice,
  sendReactionNotice,
  sendUnsubscribeNotice,
  type NoticeDeps,
} from "./admin-notices";
import type { Mailer, OutgoingEmail } from "./smtp";

const siteUrl = "https://prytz.nz";
const erik = { id: "e", name: "Erik", email: "erik@gmail.com" };
const karin = { id: "row-k", name: "Karin", email: "karin@example.se" };

let db: Db;
let postId: string;

beforeEach(async () => {
  db = await createTestDb();
  [{ id: postId }] = await db
    .insert(posts)
    .values({ title: "Milford Sound", status: "published" })
    .returning({ id: posts.id });
});

function fakeMailer(error?: unknown) {
  const sent: OutgoingEmail[] = [];
  const close = vi.fn();
  const mailer: Mailer = {
    async send(email) {
      if (error) throw error;
      sent.push(email);
    },
    verify: vi.fn(),
    close,
  };
  return { mailer, sent, close };
}

function deps(mailer: Mailer | null) {
  const log = { info: vi.fn(), error: vi.fn() };
  const d: NoticeDeps = { mailer, siteUrl, from: "prytz.nz <noreply@prytz.nz>", adminEmail: "admin@example.com", log };
  return { deps: d, log };
}

test("reaction notice: subject and text, exactly", () => {
  const notice = buildReactionNotice({ siteUrl, reactor: erik, emoji: "❤️", post: { id: "p1", title: "Milford Sound" } });
  expect(notice.subject).toBe("Erik reacted ❤️ to Milford Sound");
  expect(notice.text).toBe("Erik (erik@gmail.com) reacted ❤️ to Milford Sound.\n\nSee the post: https://prytz.nz/?post=p1\n");
  expect(notice.html).toContain('lang="en"');
  expect(notice.html).toContain('href="https://prytz.nz/?post=p1"');
});

test("reaction notice with no name uses the address", () => {
  const notice = buildReactionNotice({
    siteUrl,
    reactor: { name: "  ", email: "erik@gmail.com" },
    emoji: "❤️",
    post: { id: "p1", title: "Milford Sound" },
  });
  expect(notice.subject).toBe("erik@gmail.com reacted ❤️ to Milford Sound");
  expect(notice.text.split("\n")[0]).toBe("erik@gmail.com reacted ❤️ to Milford Sound.");
});

test("unsubscribe notice: subject and text, exactly", () => {
  const notice = buildUnsubscribeNotice({ siteUrl: "https://prytz.nz/", person: karin });
  expect(notice.subject).toBe("Karin unsubscribed from new-post emails");
  expect(notice.text).toBe(
    "Karin (karin@example.se) unsubscribed from new-post emails.\n\nSubscribers: https://prytz.nz/admin/subscribers\n",
  );
  expect(notice.html).toContain('href="https://prytz.nz/admin/subscribers"');
});

test("unsubscribe notice with no name uses the address", () => {
  const notice = buildUnsubscribeNotice({ siteUrl, person: { name: "", email: "karin@example.se" } });
  expect(notice.subject).toBe("karin@example.se unsubscribed from new-post emails");
  expect(notice.text.split("\n")[0]).toBe("karin@example.se unsubscribed from new-post emails.");
});

test("html escapes names and titles", () => {
  const reaction = buildReactionNotice({
    siteUrl,
    reactor: { name: "<b>Erik</b>", email: "erik@gmail.com" },
    emoji: "❤️",
    post: { id: "p1", title: "A & B" },
  });
  expect(reaction.html).toContain("&lt;b&gt;Erik&lt;/b&gt;");
  expect(reaction.html).toContain("A &amp; B");
  expect(reaction.html).not.toContain("<b>Erik");
  const unsubscribe = buildUnsubscribeNotice({ siteUrl, person: { name: "<i>K</i>", email: "k@example.se" } });
  expect(unsubscribe.html).toContain("&lt;i&gt;K&lt;/i&gt;");
  expect(unsubscribe.html).not.toContain("<i>K");
});

test("sendReactionNotice sends one email to the admin, reply-to the reactor, and closes", async () => {
  const { mailer, sent, close } = fakeMailer();
  const { deps: d, log } = deps(mailer);
  await sendReactionNotice({ ...d, db }, { postId, emoji: "❤️", reactor: erik });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    from: "prytz.nz <noreply@prytz.nz>",
    to: { name: "", address: "admin@example.com" },
    replyTo: "erik@gmail.com",
    subject: "Erik reacted ❤️ to Milford Sound",
    headers: {},
  });
  expect(sent[0].text).toContain(`https://prytz.nz/?post=${postId}`);
  expect(close).toHaveBeenCalledTimes(1);
  expect(log.info).toHaveBeenCalledWith("[notify] reaction email sent (post %s, user %s)", postId, "e");
});

test("sendReactionNotice for a deleted post sends nothing and logs", async () => {
  const { mailer, sent, close } = fakeMailer();
  const { deps: d, log } = deps(mailer);
  const gone = "00000000-0000-0000-0000-000000000000";
  await sendReactionNotice({ ...d, db }, { postId: gone, emoji: "❤️", reactor: erik });
  expect(sent).toEqual([]);
  expect(log.info).toHaveBeenCalledWith("[notify] reaction email not sent: post %s not found", gone);
  expect(close).toHaveBeenCalledTimes(1);
});

test("sendUnsubscribeNotice sends one email to the admin, reply-to the person, and closes", async () => {
  const { mailer, sent, close } = fakeMailer();
  const { deps: d, log } = deps(mailer);
  await sendUnsubscribeNotice(d, karin);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    to: { name: "", address: "admin@example.com" },
    replyTo: "karin@example.se",
    subject: "Karin unsubscribed from new-post emails",
  });
  expect(close).toHaveBeenCalledTimes(1);
  expect(log.info).toHaveBeenCalledWith("[notify] unsubscribe email sent (subscriber %s)", "row-k");
});

test("sendUnsubscribeNotice skips the admin's own address", async () => {
  const { mailer, sent } = fakeMailer();
  const { deps: d } = deps(mailer);
  await sendUnsubscribeNotice(d, { id: "row-a", name: "Vilhelm", email: "ADMIN@example.com" });
  expect(sent).toEqual([]);
});

test("a failed send is logged without addresses and doesn't throw", async () => {
  const reactionMailer = fakeMailer(new Error("550 <admin@example.com> rejected mail from <Erik@Gmail.com>"));
  const unsubscribeMailer = fakeMailer(new Error("550 <admin@example.com> rejected mail from <karin@example.se>"));
  const { deps: d, log } = deps(null);
  await expect(
    sendReactionNotice({ ...d, mailer: reactionMailer.mailer, db }, { postId, emoji: "❤️", reactor: erik }),
  ).resolves.toBeUndefined();
  await expect(sendUnsubscribeNotice({ ...d, mailer: unsubscribeMailer.mailer }, karin)).resolves.toBeUndefined();
  expect(log.error).toHaveBeenCalledWith(
    "[notify] reaction email failed (post %s, user %s)",
    postId,
    "e",
    expect.stringContaining("rejected mail"),
  );
  expect(log.error).toHaveBeenCalledWith(
    "[notify] unsubscribe email failed (subscriber %s)",
    "row-k",
    expect.stringContaining("rejected mail"),
  );
  const logged = JSON.stringify(log.error.mock.calls).toLowerCase();
  expect(logged).not.toContain("admin@example.com");
  expect(logged).not.toContain("erik@gmail.com");
  expect(logged).not.toContain("karin@example.se");
  expect(reactionMailer.close).toHaveBeenCalledTimes(1);
  expect(unsubscribeMailer.close).toHaveBeenCalledTimes(1);
});

test("no SMTP → nothing sent, an info log", async () => {
  const { deps: d, log } = deps(null);
  await sendReactionNotice({ ...d, db }, { postId, emoji: "❤️", reactor: erik });
  await sendUnsubscribeNotice(d, karin);
  expect(log.info).toHaveBeenCalledWith("[notify] %s email not sent: SMTP not configured", "reaction");
  expect(log.info).toHaveBeenCalledWith("[notify] %s email not sent: SMTP not configured", "unsubscribe");
});
