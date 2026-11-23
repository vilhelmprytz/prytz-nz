# Test email button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Send test email` button on `/admin` that sends one plain Swedish test email to `ADMIN_EMAIL` and shows the result.

**Architecture:** A small `sendTestEmail(mailer, …)` function next to the other SMTP code turns a send into one of three result messages. An admin-only server action calls it with `createMailer(getEnv())`. A client component shows the result with `useActionState`.

**Tech Stack:** Next.js 16 server actions and `useActionState`, nodemailer through the existing `Mailer`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-new-post-emails-design.md`, section "Test email button".

## Global Constraints

- Reuse `Mailer`, `OutgoingEmail` and `createMailer` from `src/notify/smtp.ts`; no new SMTP code or dependencies.
- The admin UI copy is English. The email is Swedish and verbatim from the spec.
- The test send must not touch `post_email_subscribers` or `posts.announced_at`.
- Read `node_modules/next/dist/docs/` before using a Next.js API you haven't used in this repo. The existing `useActionState` pattern is in `src/app/unlock/UnlockForm.tsx`.
- Checks: `npm test`, `npm run lint`, `npx tsc --noEmit`; e2e with `npm run test:e2e` (the compose db must be running).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **SMTP off** (`SMTP_HOST` empty, as in e2e): the button shows `Email is off: SMTP_HOST isn't set.` and nothing throws. (Task 1 unit test, Task 2 e2e.)
2. **The SMTP server rejects or times out:** the page shows `Couldn't send: <message>` instead of an error screen, and the connection is closed. (Task 1 test.)
3. **Something that isn't an `Error` is thrown:** the message is still readable. (Task 1 test.)
4. **A double tap while sending:** the button is disabled while pending, so only one email goes out. (Task 2: `disabled={pending}`; checked in review.)
5. **A non-admin posting to the action:** `assertAdmin()` throws before anything is sent. (Task 2: first line of the action; checked in review.)

---

### Task 1: The test send

**Files:**
- Create: `src/notify/test-email.ts`
- Test: `src/notify/test-email.test.ts`

**Interfaces:**
- Consumes: `Mailer`, `OutgoingEmail` from `./smtp`.
- Produces:
  - `type TestEmailResult = { ok: boolean; message: string }`
  - `sendTestEmail(mailer: Mailer | null, input: { from: string; to: string }, log?: Pick<Console, "error">): Promise<TestEmailResult>`: never throws. For `null` returns `{ ok: false, message: "Email is off: SMTP_HOST isn't set." }`. Otherwise it sends one `OutgoingEmail` (`to: { name: "", address: to }`, `replyTo: to`, `headers: {}`), the subject `Test från prytz.nz`, the text below, and an HTML version with the same two paragraphs inside `<html lang="sv">`. On success: `{ ok: true, message: \`Sent to ${to}. Check the inbox, and the spam folder.\` }`. On failure: `log.error("[smtp] test email failed", error)` and `{ ok: false, message: \`Couldn't send: ${error instanceof Error ? error.message : String(error)}\` }`. `mailer.close()` runs once in every case where a mailer exists.
- Text, exactly: `"Hej!\n\nDet här är ett testmejl från prytz.nz. Kommer det fram fungerar mejlinställningarna.\n"`

- [ ] **Step 1: Write failing tests** with a fake `Mailer` that records sends:

```ts
test("sends one Swedish test email to the admin", async () => {
  // expect { ok: true, message: "Sent to admin@example.com. Check the inbox, and the spam folder." }
  // sent[0] toMatchObject { from: "prytz.nz <noreply@prytz.nz>", to: { address: "admin@example.com" }, subject: "Test från prytz.nz",
  //   text: "Hej!\n\nDet här är ett testmejl från prytz.nz. Kommer det fram fungerar mejlinställningarna.\n" }
  // sent[0].html contains 'lang="sv"' and "Kommer det fram fungerar mejlinställningarna."; close called once
});
test("a rejected send shows the server's message and closes")   // send rejects Error("535 5.7.8 Authentication failed") → { ok: false, message: "Couldn't send: 535 5.7.8 Authentication failed" }; log.error called with "[smtp] test email failed"; close once
test("a non-Error failure is still readable")                    // send rejects "connection reset" (a string) → message "Couldn't send: connection reset"
test("SMTP off → says so, sends nothing")                         // mailer null → { ok: false, message: "Email is off: SMTP_HOST isn't set." }
```

- [ ] **Step 2: Run** `npx vitest run src/notify/test-email.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/notify/test-email.ts` (`import "server-only";`).
- [ ] **Step 4: Run** `npx vitest run src/notify/test-email.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**: `git add src/notify/test-email.ts src/notify/test-email.test.ts && git commit -m "feat: send a plain test email to the admin"`

---

### Task 2: The button on /admin

**Files:**
- Create: `src/notify/actions.ts`, `src/components/admin/TestEmailButton.tsx`
- Modify: `src/app/admin/(protected)/page.tsx`, `src/app/admin/admin.module.css` (only if a result style is needed)
- Modify: `e2e/admin.spec.ts`, `README.md`

**Interfaces:**
- Consumes: `sendTestEmail`, `TestEmailResult` (Task 1); `createMailer` (`src/notify/smtp.ts`); `assertAdmin` (`src/auth/viewer.ts`); `getEnv`.
- Produces:
  - `sendTestEmailAction(_prev: TestEmailResult | null, _formData: FormData): Promise<TestEmailResult>` in `src/notify/actions.ts` (`"use server"`): `await assertAdmin()` first, then `sendTestEmail(createMailer(env), { from: env.SMTP_FROM ?? "", to: env.ADMIN_EMAIL })`.
  - `TestEmailButton` (`"use client"`): a `<form action={action}>` with `useActionState(sendTestEmailAction, null)`, a submit button `Send test email` (`Sending…` and `disabled` while pending, `className={styles.button}` from `admin.module.css`), and below it `<p role="status">` with `state.message` when there is a state.
- On `/admin`, render `<TestEmailButton />` directly after the `New post` form.

- [ ] **Step 1: Write the failing e2e test** in `e2e/admin.spec.ts` (the e2e server has no SMTP):

```ts
test("the test email button reports that email is off", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Send test email" }).click();
  await expect(page.getByRole("status")).toHaveText("Email is off: SMTP_HOST isn't set.");
});
```

- [ ] **Step 2: Run** `npx playwright test e2e/admin.spec.ts -g "test email"`. Expected: FAIL (no such button).
- [ ] **Step 3: Implement** the action, the component and the page change.
- [ ] **Step 4: README:** in the first-deploy **Email** check, after `[smtp] ok`, add: "Then press **Send test email** on `/admin`; it emails only you and shows the SMTP server's answer." In the Email section, add a line: "**Test email:** the **Send test email** button on `/admin` sends a short Swedish test message to `ADMIN_EMAIL` and shows whether it was accepted."
- [ ] **Step 5: Run** `npm run test:e2e`. Expected: all pass, including the new test. Then run `npm test && npm run lint && npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 6: Manual check against Mailpit.** Start the production server with SMTP pointed at Mailpit (as in the previous plan's Task 8), press the button as the e2e admin, and confirm that Mailpit has one email `Test från prytz.nz` with å/ä/ö intact, and the page shows `Sent to admin@e2e.test. …`.
- [ ] **Step 7: Commit**: `git add src/notify/actions.ts src/components/admin/TestEmailButton.tsx "src/app/admin/(protected)/page.tsx" e2e/admin.spec.ts README.md && git commit -m "feat: test email button on the admin page"` (add `admin.module.css` if changed).
