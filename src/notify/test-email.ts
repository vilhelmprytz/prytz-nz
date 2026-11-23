import "server-only";
import type { Mailer } from "./smtp";

export type TestEmailResult = { ok: boolean; message: string };

const SUBJECT = "Test från prytz.nz";
const LINES = ["Hej!", "Det här är ett testmejl från prytz.nz. Kommer det fram fungerar mejlinställningarna."];

/** One plain Swedish email to the admin, to check SMTP from /admin. Never throws; says what happened. */
export async function sendTestEmail(
  mailer: Mailer | null,
  { from, to }: { from: string; to: string },
  log: Pick<Console, "error"> = console,
): Promise<TestEmailResult> {
  if (!mailer) return { ok: false, message: "Email is off: SMTP_HOST isn't set." };
  try {
    await mailer.send({
      from,
      to: { name: "", address: to },
      replyTo: to,
      subject: SUBJECT,
      text: `${LINES.join("\n\n")}\n`,
      html: `<!doctype html>
<html lang="sv">
<head><meta charset="utf-8"><title>${SUBJECT}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1f1d1a;">
${LINES.map((line) => `<p>${line}</p>`).join("\n")}
</body>
</html>
`,
      headers: {},
    });
    return { ok: true, message: `Sent to ${to}. Check the inbox, and the spam folder.` };
  } catch (error) {
    log.error("[smtp] test email failed", error);
    return { ok: false, message: `Couldn't send: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    mailer.close();
  }
}
