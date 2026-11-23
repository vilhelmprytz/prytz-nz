import { expect, test, vi } from "vitest";
import type { Mailer, OutgoingEmail } from "./smtp";
import { sendTestEmail } from "./test-email";

const input = { from: "prytz.nz <noreply@prytz.nz>", to: "admin@example.com" };

function fakeMailer(send: (email: OutgoingEmail) => Promise<void>) {
  const close = vi.fn();
  const mailer: Mailer = { send, verify: vi.fn(), close };
  return { mailer, close };
}

test("sends one Swedish test email to the admin", async () => {
  const sent: OutgoingEmail[] = [];
  const { mailer, close } = fakeMailer(async (email) => {
    sent.push(email);
  });
  expect(await sendTestEmail(mailer, input)).toEqual({
    ok: true,
    message: "Sent to admin@example.com. Check the inbox, and the spam folder.",
  });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    from: "prytz.nz <noreply@prytz.nz>",
    to: { address: "admin@example.com" },
    subject: "Test från prytz.nz",
    text: "Hej!\n\nDet här är ett testmejl från prytz.nz. Kommer det fram fungerar mejlinställningarna.\n",
  });
  expect(sent[0].html).toContain('lang="sv"');
  expect(sent[0].html).toContain("Kommer det fram fungerar mejlinställningarna.");
  expect(close).toHaveBeenCalledTimes(1);
});

test("a rejected send shows the server's message and closes", async () => {
  const failure = new Error("535 5.7.8 Authentication failed");
  const { mailer, close } = fakeMailer(async () => {
    throw failure;
  });
  const log = { error: vi.fn() };
  expect(await sendTestEmail(mailer, input, log)).toEqual({
    ok: false,
    message: "Couldn't send: 535 5.7.8 Authentication failed",
  });
  expect(log.error).toHaveBeenCalledWith("[smtp] test email failed", failure);
  expect(close).toHaveBeenCalledTimes(1);
});

test("a non-Error failure is still readable", async () => {
  const { mailer } = fakeMailer(() => Promise.reject("connection reset"));
  const result = await sendTestEmail(mailer, input, { error: vi.fn() });
  expect(result).toEqual({ ok: false, message: "Couldn't send: connection reset" });
});

test("SMTP off → says so, sends nothing", async () => {
  expect(await sendTestEmail(null, input)).toEqual({ ok: false, message: "Email is off: SMTP_HOST isn't set." });
});
