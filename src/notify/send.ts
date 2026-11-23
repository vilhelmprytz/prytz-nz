import "server-only";
import type { Db } from "@/db/client";
import type { Env } from "@/env";
import { buildNewPostEmail, type AnnouncedPost } from "./email";
import { createMailer, type Mailer } from "./smtp";
import { listRecipients } from "./subscribers";

export type SendDeps = {
  db: Db;
  mailer: Mailer | null;
  siteUrl: string;
  from: string;
  replyTo: string;
  log?: Pick<Console, "info" | "error">;
};

/** SMTP errors often quote the recipient ("550 <a@b.se>: …"); log only the message, without the address. */
function redact(error: unknown, address: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return message.replace(new RegExp(escaped, "gi"), "<address>");
}

export function sendDepsFromEnv(db: Db, env: Env): SendDeps {
  return {
    db,
    mailer: createMailer(env),
    siteUrl: env.BETTER_AUTH_URL,
    from: env.SMTP_FROM ?? "",
    replyTo: env.ADMIN_EMAIL,
  };
}

/**
 * One email per person on the list, in turn, over one connection. Runs after Publish has returned:
 * it never throws, and failures go to the log (user ids, never addresses). Nothing is retried.
 */
export async function sendNewPostEmails(deps: SendDeps, post: AnnouncedPost): Promise<{ sent: number; failed: number }> {
  const { db, mailer, siteUrl, from, replyTo, log = console } = deps;
  const result = { sent: 0, failed: 0 };
  if (!mailer) {
    log.info("[notify] post %s: SMTP not configured, no emails sent", post.id);
    return result;
  }
  try {
    for (const recipient of await listRecipients(db)) {
      const email = buildNewPostEmail({
        siteUrl,
        post,
        recipientName: recipient.name,
        unsubscribeToken: recipient.unsubscribeToken,
      });
      try {
        await mailer.send({
          from,
          to: { name: recipient.name, address: recipient.email },
          replyTo,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: {
            "List-Unsubscribe": `<${email.oneClickUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        result.sent++;
      } catch (error) {
        result.failed++;
        log.error("[notify] post %s: sending to user %s failed", post.id, recipient.userId, redact(error, recipient.email));
      }
    }
    log.info("[notify] post %s: sent %d, failed %d", post.id, result.sent, result.failed);
  } catch (error) {
    log.error("[notify] post %s: sending failed", post.id, error);
  } finally {
    mailer.close();
  }
  return result;
}
