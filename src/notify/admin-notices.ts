import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { posts } from "@/db/schema";
import type { Env } from "@/env";
import { escapeHtml } from "./email";
import { createMailer, redactAddresses, type Mailer } from "./smtp";
import type { Person } from "./subscribers";

/** Emails to the admin (English, like the admin pages): a reaction, an unsubscribe. */
export type NoticeDeps = {
  mailer: Mailer | null;
  siteUrl: string;
  from: string;
  adminEmail: string;
  log?: Pick<Console, "info" | "error">;
};

export function noticeDepsFromEnv(env: Env): NoticeDeps {
  return { mailer: createMailer(env), siteUrl: env.BETTER_AUTH_URL, from: env.SMTP_FROM ?? "", adminEmail: env.ADMIN_EMAIL };
}

export type Notice = { subject: string; text: string; html: string };

type Who = { name: string; email: string };

/** `Erik` for the subject, `Erik (erik@gmail.com)` for the body; the address alone when there's no name. */
function describe({ name, email }: Who): { who: string; label: string } {
  const trimmed = name.trim();
  return trimmed ? { who: trimmed, label: `${trimmed} (${email})` } : { who: email, label: email };
}

function html(title: string, sentence: string, link: { text: string; url: string }): string {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${e(title)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1f1d1a;">
<p>${e(sentence)}</p>
<p><a href="${e(link.url)}">${e(link.text)}</a></p>
</body>
</html>
`;
}

export function buildReactionNotice(input: {
  siteUrl: string;
  reactor: Who;
  emoji: string;
  post: { id: string; title: string };
}): Notice {
  const { who, label } = describe(input.reactor);
  const postUrl = new URL(`/?${new URLSearchParams({ post: input.post.id })}`, input.siteUrl).toString();
  const subject = `${who} reacted ${input.emoji} to ${input.post.title}`;
  const sentence = `${label} reacted ${input.emoji} to ${input.post.title}.`;
  return {
    subject,
    text: `${sentence}\n\nSee the post: ${postUrl}\n`,
    html: html(subject, sentence, { text: "See the post", url: postUrl }),
  };
}

export function buildUnsubscribeNotice(input: { siteUrl: string; person: Who }): Notice {
  const { who, label } = describe(input.person);
  const listUrl = new URL("/admin/subscribers", input.siteUrl).toString();
  const subject = `${who} unsubscribed from new-post emails`;
  const sentence = `${label} unsubscribed from new-post emails.`;
  return {
    subject,
    text: `${sentence}\n\nSubscribers: ${listUrl}\n`,
    html: html(subject, sentence, { text: "Subscribers", url: listUrl }),
  };
}

/** Sends one notice to the admin. Never throws; the caller's response has already gone. */
async function deliver(
  deps: NoticeDeps,
  kind: "reaction" | "unsubscribe",
  replyTo: string,
  build: () => Promise<Notice | null>,
  logged: { sent: () => void; failed: (message: string) => void },
): Promise<void> {
  const { mailer, from, adminEmail, log = console } = deps;
  if (!mailer) {
    log.info("[notify] %s email not sent: SMTP not configured", kind);
    return;
  }
  try {
    const notice = await build();
    if (!notice) return;
    await mailer.send({ from, to: { name: "", address: adminEmail }, replyTo, ...notice, headers: {} });
    logged.sent();
  } catch (error) {
    logged.failed(redactAddresses(error, [adminEmail, replyTo]));
  } finally {
    mailer.close();
  }
}

/** Someone (not the admin) added a reaction. Loads the post's title; a post deleted meanwhile sends nothing. */
export async function sendReactionNotice(
  deps: NoticeDeps & { db: Db },
  input: { postId: string; emoji: string; reactor: { id: string; name: string; email: string } },
): Promise<void> {
  const { db, log = console } = deps;
  const { postId, emoji, reactor } = input;
  await deliver(
    deps,
    "reaction",
    reactor.email,
    async () => {
      const [post] = await db.select({ id: posts.id, title: posts.title }).from(posts).where(eq(posts.id, postId));
      if (!post) {
        log.info("[notify] reaction email not sent: post %s not found", postId);
        return null;
      }
      return buildReactionNotice({ siteUrl: deps.siteUrl, reactor, emoji, post });
    },
    {
      sent: () => log.info("[notify] reaction email sent (post %s, user %s)", postId, reactor.id),
      failed: (message) => log.error("[notify] reaction email failed (post %s, user %s)", postId, reactor.id, message),
    },
  );
}

/** Someone unsubscribed themselves. The admin's own unsubscribe sends nothing. */
export async function sendUnsubscribeNotice(deps: NoticeDeps, person: Person): Promise<void> {
  const { log = console } = deps;
  if (person.email.trim().toLowerCase() === deps.adminEmail.trim().toLowerCase()) return;
  await deliver(
    deps,
    "unsubscribe",
    person.email,
    async () => buildUnsubscribeNotice({ siteUrl: deps.siteUrl, person }),
    {
      sent: () => log.info("[notify] unsubscribe email sent (subscriber %s)", person.id),
      failed: (message) => log.error("[notify] unsubscribe email failed (subscriber %s)", person.id, message),
    },
  );
}
