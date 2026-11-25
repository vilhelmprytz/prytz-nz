import "server-only";
import nodemailer, { type SMTPPoolOptions } from "nodemailer";
import type { Env } from "@/env";

export type OutgoingEmail = {
  from: string;
  to: { name: string; address: string };
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
};

/** The few things the app needs from an SMTP connection; tests use a fake. */
export type Mailer = {
  send(email: OutgoingEmail): Promise<void>;
  verify(): Promise<void>;
  close(): void;
};

export function smtpOptions(env: Env): SMTPPoolOptions & { pool: true } {
  return {
    // One connection and one login for all of a post's emails; providers throttle repeated logins.
    pool: true,
    maxConnections: 1,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURITY === "tls",
    // starttls: refuse to go on (and send credentials) without encryption.
    requireTLS: env.SMTP_SECURITY === "starttls",
    ignoreTLS: env.SMTP_SECURITY === "none",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    // A hanging server must not hold the after-publish work forever.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  };
}

/** SMTP errors often quote addresses ("550 <a@b.se>: …"); log only the message, with every address replaced. */
export function redactAddresses(error: unknown, addresses: string[]): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const address of addresses.filter(Boolean)) {
    const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    message = message.replace(new RegExp(escaped, "gi"), "<address>");
  }
  return message;
}

/** null when SMTP_HOST is empty: emails are off. */
export function createMailer(env: Env): Mailer | null {
  if (!env.SMTP_HOST) return null;
  const transport = nodemailer.createTransport(smtpOptions(env));
  return {
    async send(email) {
      await transport.sendMail(email);
    },
    async verify() {
      await transport.verify();
    },
    close() {
      transport.close();
    },
  };
}

/** Startup check: logs whether the SMTP connection and login work. Never throws. */
export async function checkSmtp(mailer: Mailer | null, log: Pick<Console, "info" | "error"> = console): Promise<void> {
  if (!mailer) return;
  try {
    await mailer.verify();
    log.info("[smtp] ok");
  } catch (error) {
    log.error("[smtp] check failed", error);
  } finally {
    mailer.close();
  }
}
