# Subscriber list in admin, and emails to the admin: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin see, add, remove and re-add people on the new-post email list at `/admin/subscribers` (including relatives with no account), and email the admin when someone unsubscribes or reacts.

**Architecture:** `post_email_subscribers` gets its own id and holds either a sign-in (`user_id`) or a typed address (`email`, `name`), plus `source` and `unsubscribed_by`. `src/notify/subscribers.ts` resolves each row's address and name and links typed addresses to sign-ins so nobody gets two copies. A new `src/notify/subscriber-admin.ts` backs the admin page. A new `src/notify/admin-notices.ts` builds and sends the two admin emails, which the reaction and unsubscribe code paths start with `after()`.

**Tech Stack:** Next.js 16 (server actions, `after()`, `refresh()` from `next/cache`), Drizzle ORM + drizzle-kit, Postgres (PGlite in unit tests), nodemailer through the existing `Mailer`, zod 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-subscriber-admin-design.md` (builds on `docs/superpowers/specs/2026-11-23-new-post-emails-design.md`).

## Global Constraints

- Admin UI and the two admin emails are English. New-post emails stay Swedish.
- Copy is verbatim from the spec. Footers: `reaction` → `Du får det här mejlet eftersom du har reagerat på ett inlägg på prytz.nz.`; `admin` → `Du får det här mejlet eftersom du har bett om att få mejl om nya inlägg på prytz.nz.`
- No email addresses in logs. SMTP error messages pass through `redactAddresses` (Task 2).
- Admin emails never throw into the request: they run in `after()`, catch everything, log, and close the mailer.
- Existing unsubscribe tokens, timestamps and subscription states are unchanged by the migration.
- An insert of only `user_id` (`insert into post_email_subscribers (user_id) … on conflict do nothing`) keeps working: the old container does it during a deploy, and so does `e2e/unsubscribe.spec.ts`.
- No new dependencies.
- Read the matching guide in `node_modules/next/dist/docs/` before using a Next.js API this repo doesn't use yet (`refresh`: `01-app/03-api-reference/04-functions/refresh.md`; `after`: `after.md`).
- Checks: `npm test`, `npm run lint`, `npx tsc --noEmit`; e2e with `npm run test:e2e` (the compose db must be running).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Addresses typed with capitals or spaces** (` Anna@Example.SE `): stored as `anna@example.se`, and matched against existing rows and accounts the same way. Test in Task 3.
2. **A mail app sending one-click twice:** the second call reports `changed: false`, so the admin gets one email, not two. Test in Task 2.
3. **Removing someone who already unsubscribed themselves:** stays `themselves` with the original date; the admin's click doesn't overwrite it. Test in Task 3.
4. **A Google name with HTML in it** (`<b>Erik</b>`) in an admin email: escaped in the HTML part. Test in Task 4.
5. **A post deleted between the reaction and the `after()` send:** no crash, no email, an info log. Test in Task 4.

---

### Task 1: Migration and schema

**Files:**
- Modify: `src/db/schema.ts` (`postEmailSubscribers`)
- Create: `drizzle/0006_subscriber_admin.sql`, `drizzle/meta/0006_snapshot.json` (generated), `drizzle/meta/_journal.json` (generated entry)
- Test: `src/db/migration-subscribers.test.ts`

**Interfaces:**
- Produces: `postEmailSubscribers` with columns `id` (uuid, PK, `defaultRandom()`), `userId` (`text("user_id")`, nullable, `.unique()`, references `user.id` on delete cascade), `email` (`text("email")`, nullable, `.unique()`), `name` (`text("name").notNull().default("")`), `source` (`text("source", { enum: ["reaction", "admin"] }).notNull().default("reaction")`), `unsubscribeToken`, `subscribedAt`, `unsubscribedAt` (all three unchanged), `unsubscribedBy` (`text("unsubscribed_by", { enum: ["self", "admin"] })`, nullable). Table extra config: `check("post_email_subscribers_user_or_email", sql\`"user_id" is not null or "email" is not null\`)`. Update the table's doc comment: anyone who reacted, the admin, and addresses the admin added.

- [ ] **Step 1: Write the failing migration test** in `src/db/migration-subscribers.test.ts`, following `src/db/migration-emails.test.ts` (`migrationsBefore("0006_")`, raw SQL through the PGlite client):

```ts
test("existing rows keep token, dates and state; source and unsubscribed_by are filled in")
// before 0006: users u1, u2; insert post_email_subscribers (user_id, unsubscribe_token, subscribed_at, unsubscribed_at)
//   u1: token 'a'.repeat(64), subscribed_at '2026-11-01T00:00:00Z', unsubscribed_at null
//   u2: token 'b'.repeat(64), subscribed_at '2026-11-02T00:00:00Z', unsubscribed_at '2026-11-10T00:00:00Z'
// migrate; select … order by user_id →
//   u1: same token and subscribed_at, unsubscribed_at null, source 'reaction', unsubscribed_by null, name '', email null, id is a uuid
//   u2: same token, unsubscribed_at kept, source 'reaction', unsubscribed_by 'self'
//   the two ids differ
test("an insert of only user_id still works (old code during a deploy)")
// after migrate: insert into post_email_subscribers (user_id) values ('u3') on conflict do nothing → 1 row with a 64-hex token, source 'reaction'
test("a typed address needs no user; a row needs one or the other; both are unique")
// insert (email, source) values ('anna@example.se', 'admin') → ok, user_id null
// insert (name) values ('x') → rejects (check constraint)
// a second 'anna@example.se' → rejects; a second row for the same user_id → rejects
```

- [ ] **Step 2: Run** `npx vitest run src/db/migration-subscribers.test.ts`. Expected: FAIL (`relation`/column errors, or the journal has no `0006_`).
- [ ] **Step 3: Change the schema**, then run `npx drizzle-kit generate --name subscriber_admin`.
- [ ] **Step 4: Hand-edit `drizzle/0006_subscriber_admin.sql`** so that, separated by `--> statement-breakpoint`, it does in this order: drop the old primary key (`ALTER TABLE "post_email_subscribers" DROP CONSTRAINT "post_email_subscribers_pkey"`), add `id` as `uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL`, make `user_id` nullable, add `email`, `name`, `source`, `unsubscribed_by`, add the unique constraints on `user_id` and `email` and the check constraint, and finally:

```sql
-- Until now the only way to unsubscribe was yourself.
UPDATE "post_email_subscribers" SET "unsubscribed_by" = 'self' WHERE "unsubscribed_at" IS NOT NULL;
```

Keep the constraint names drizzle-kit chose, so the snapshot matches.
- [ ] **Step 5: Confirm the snapshot matches the schema:** `npx drizzle-kit generate` → `No schema changes`.
- [ ] **Step 6: Run** `npx vitest run src/db/` and then `npm test`. Expected: all PASS (existing tests still pass on the new schema).
- [ ] **Step 7: Commit:** `git add src/db drizzle && git commit -m "feat: let the email list hold typed addresses"`

---

### Task 2: The list, linking, and new-post emails to typed addresses

**Files:**
- Modify: `src/notify/subscribers.ts`, `src/notify/email.ts`, `src/notify/send.ts`, `src/notify/smtp.ts`, `src/app/unsubscribe/actions.ts`, `src/app/unsubscribe/one-click/route.ts`
- Test: `src/notify/subscribers.test.ts`, `src/notify/email.test.ts`, `src/notify/send.test.ts`, `src/notify/announce.test.ts`

**Interfaces:**
- Consumes: the Task 1 schema.
- Produces (in `src/notify/subscribers.ts`):
  - `type SubscriberSource = "reaction" | "admin"`
  - `type Person = { id: string; email: string; name: string }`. `id` is the subscriber row's id. `email` is the account's email when `user_id` is set, else the typed `email`. `name` is the typed `name` when non-empty, else the account's name, else `""`. Use the same resolution everywhere (one shared select shape: left join `user`, `coalesce(user.email, s.email)`, `coalesce(nullif(s.name, ''), user.name, '')`).
  - `type Recipient = Person & { source: SubscriberSource; unsubscribeToken: string }`. The old `userId` field is gone.
  - `type SubscriptionChange = { changed: boolean; person: Person }`
  - `addSubscriber(db: Db, userId: string): Promise<void>`. In order: (1) a row with this `user_id` exists → done; (2) the user's email is verified and a row with `email = lower(user.email)` and `user_id is null` exists → set its `user_id` (keep everything else) and done; (3) insert `{ userId }` on conflict do nothing.
  - `listRecipients(db: Db): Promise<Recipient[]>`: subscribed rows where `user_id is null` or the account's email is verified. Order by `subscribedAt`, then `id`.
  - `getSubscription(db, token)`: unchanged.
  - `setSubscribed(db: Db, token: string, subscribed: boolean, now: Date): Promise<SubscriptionChange | null>`. `null` for an unknown token. Unsubscribing sets `unsubscribedAt = now`, `unsubscribedBy = "self"` only if currently subscribed. Subscribing clears both. `changed` is true only if the state actually flipped.
- Produces (in `src/notify/smtp.ts`): `redactAddresses(error: unknown, addresses: string[]): string`, moved from `send.ts`'s private `redact`. It returns the error message with each address replaced by `<address>`, case-insensitively.
- `src/notify/email.ts`: `NewPostEmailInput` gains `source: SubscriberSource`. The footer's "why" line follows Global Constraints. `escapeHtml` becomes an export.
- `src/notify/send.ts`: passes `recipient.source`. The per-recipient failure log becomes `log.error("[notify] post %s: sending to subscriber %s failed", post.id, recipient.id, redactAddresses(error, [recipient.email]))`.
- The unsubscribe action and the one-click route only adapt to the new return type here. Task 5 uses it.

- [ ] **Step 1: Write failing tests.** In `subscribers.test.ts` update the existing tests to the new shapes (`setSubscribed` now resolves to `{ changed: true, person: … }` or `null`; recipients have `id`/`source`, not `userId`), and add:

```ts
test("a typed address is a recipient, with its typed name and source 'admin'")
// insert { email: "anna@example.se", name: "Anna", source: "admin" } → listRecipients → [{ email: "anna@example.se", name: "Anna", source: "admin", … }]
test("reacting with a matching verified address links the typed row instead of adding one")
// typed row anna@example.se name "Mormor Anna"; user "g" email "Anna@Example.se" verified, name "Anna Google"; addSubscriber(db, "g")
// → one row, user_id "g", same token, source "admin"; listRecipients → one recipient, name "Mormor Anna", email "Anna@Example.se"
test("an unverified account is never linked")              // same, user unverified → two rows; listRecipients has only the typed one
test("an unsubscribed typed row stays unsubscribed after linking")
test("the account's name is used when no name was typed")  // typed name "" → recipient name is the user's name
test("setSubscribed reports whether anything changed")
// subscribed → false: { changed: true, person: { id, email, name } }, unsubscribed_by 'self'
// again false: { changed: false, … } and unsubscribed_at unchanged (Review Focus 2)
// true: changed true, unsubscribed_at and unsubscribed_by null
```

In `announce.test.ts`, add `"publishing links an admin address typed on the list instead of adding a second row"`. In `email.test.ts`, add `"a person the admin added gets the 'bett om' footer"` (exact line from Global Constraints). Pass `source: "reaction"` in the existing `base`. In `send.test.ts`, update the failure-log expectation to the new message and the subscriber id, and add `"a typed address gets one email, greeted by its typed name"`.

- [ ] **Step 2: Run** `npx vitest run src/notify`. Expected: FAIL (types and new behavior).
- [ ] **Step 3: Implement** the interfaces above. Adjust `src/app/unsubscribe/actions.ts` and `one-click/route.ts` to compile; they don't send anything yet.
- [ ] **Step 4: Run** `npx vitest run src/notify`, `npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit:** `git commit -am "feat: send new-post emails to typed addresses, linked to sign-ins"`

---

### Task 3: Admin list operations

**Files:**
- Create: `src/notify/subscriber-admin.ts`
- Test: `src/notify/subscriber-admin.test.ts`

**Interfaces:**
- Consumes: `SubscriberSource` (Task 2), the Task 1 schema.
- Produces:
  - `parseNewSubscriber(email: string, name: string): { email: string; name: string } | null`. Trims both and lowercases the email. Returns `null` unless `z.email()` accepts the email.
  - `type AddOutcome = "added" | "already-subscribed" | "already-unsubscribed"`
  - `addSubscriberByAdmin(db: Db, input: { email: string; name: string }): Promise<AddOutcome>`. The input has already gone through `parseNewSubscriber`. The existing row is the one with `email = input.email`, or the one whose `user_id` is a verified account with `lower(user.email) = input.email`. If there is one, return its state. Otherwise insert `{ email, name, source: "admin" }`, with `userId` set to that verified account if one exists.
  - `addSubscriberMessage(outcome: AddOutcome | "invalid", email: string): string`. Exactly: `Added ${email}.` / `${email} is already on the list.` / `${email} is on the list but unsubscribed. Use Turn back on below.` / `That isn't an email address.`
  - `setSubscribedById(db: Db, id: string, subscribed: boolean, now: Date): Promise<void>`. Remove: `unsubscribedAt = now`, `unsubscribedBy = "admin"` only where currently subscribed. Turn back on: clears both.
  - `type AdminSubscriberRow = { id: string; email: string; name: string; source: SubscriberSource; verified: boolean; unsubscribedAt: Date | null; unsubscribedBy: "self" | "admin" | null }`. `verified` is true when `user_id is null`, or when the account's email is verified. `email` and `name` are resolved like `Person`.
  - `listSubscribersForAdmin(db: Db): Promise<AdminSubscriberRow[]>`
  - `type SubscriberView = { id: string; name: string; email: string; note: string }`
  - `groupSubscribers(rows: AdminSubscriberRow[], adminEmail: string): { count: number; subscribed: SubscriberView[]; unsubscribed: SubscriberView[] }`. This is pure.
    - Subscribed `note`, first match wins: `gets no email (unverified)`; `you` (the email equals `adminEmail`, case-insensitive); `added by you` (source `admin`); `reacted`. Sorted by `name || email` (`localeCompare` with `sensitivity: "base"`).
    - Unsubscribed `note`: `removed by you, <date>` when `unsubscribedBy === "admin"`, otherwise `themselves, <date>` (this covers `null`). Newest first.
    - `count` is the number of subscribed rows with `verified`.
    - `<date>` uses `Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })`, e.g. `3 Nov 2026`.

- [ ] **Step 1: Write failing tests**:

```ts
test("parseNewSubscriber trims and lowercases; rejects non-addresses")
// (" Anna@Example.SE ", " Anna ") → { email: "anna@example.se", name: "Anna" }; ("a@b", "") → null; ("", "") → null   (Review Focus 1)
test("add: new address → added; same address in other case → already-subscribed")
test("add: an address that is a verified account already on the list → already-subscribed, no new row")
test("add: an address that is a verified account not on the list → row linked to that user, source 'admin'")
test("add: an address that matches only an unverified account → a separate typed row")
test("add: an unsubscribed row → already-unsubscribed, nothing changes")
test("remove marks 'admin'; turn back on clears; removing a self-unsubscribed row keeps 'self' and its date")  // Review Focus 3
test("a removed person stays off after reacting")  // setSubscribedById false, then addSubscriber(db, userId) → still unsubscribed
test("groupSubscribers: notes, order, count")
// rows: admin (reaction, adminEmail in caps), typed (admin), reactor, unverified, self-unsubscribed 2026-11-03, admin-removed 2026-11-05, legacy null-by 2026-11-01
// → subscribed notes ["you", "added by you", "reacted", "gets no email (unverified)"] in name order; count 3;
//   unsubscribed notes ["removed by you, 5 Nov 2026", "themselves, 3 Nov 2026", "themselves, 1 Nov 2026"]
test("addSubscriberMessage copy, exactly")
```

- [ ] **Step 2: Run** `npx vitest run src/notify/subscriber-admin.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/notify/subscriber-admin.ts`, in the style of `src/notify/subscribers.ts`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit:** `git add src/notify/subscriber-admin* && git commit -m "feat: add, remove and list subscribers for the admin"`

---

### Task 4: The two admin emails

**Files:**
- Create: `src/notify/admin-notices.ts`
- Test: `src/notify/admin-notices.test.ts`

**Interfaces:**
- Consumes: `Mailer`, `redactAddresses`, `createMailer` (`./smtp`); `escapeHtml` (`./email`); `Person` (`./subscribers`); `posts` table.
- Produces:
  - `type NoticeDeps = { mailer: Mailer | null; siteUrl: string; from: string; adminEmail: string; log?: Pick<Console, "info" | "error"> }`
  - `noticeDepsFromEnv(env: Env): NoticeDeps`. It returns `createMailer(env)`, `BETTER_AUTH_URL`, `SMTP_FROM ?? ""` and `ADMIN_EMAIL`.
  - `type Notice = { subject: string; text: string; html: string }`
  - `buildReactionNotice(input: { siteUrl: string; reactor: { name: string; email: string }; emoji: string; post: { id: string; title: string } }): Notice`
  - `buildUnsubscribeNotice(input: { siteUrl: string; person: { name: string; email: string } }): Notice`
  - `sendReactionNotice(deps: NoticeDeps & { db: Db }, input: { postId: string; emoji: string; reactor: { id: string; name: string; email: string } }): Promise<void>`
  - `sendUnsubscribeNotice(deps: NoticeDeps, person: Person): Promise<void>`. If `person.email` equals `adminEmail` (case-insensitive), it does nothing.
- Copy. Here `who` is `name.trim() || email`, and `label` is `${name} (${email})`, or just `email` when the name is empty:
  - Reaction: subject `${who} reacted ${emoji} to ${title}`. Text `${label} reacted ${emoji} to ${title}.\n\nSee the post: ${postUrl}\n`, where `postUrl` is built like `buildNewPostEmail`'s (`/?post=<id>`).
  - Unsubscribe: subject `${who} unsubscribed from new-post emails`. Text `${label} unsubscribed from new-post emails.\n\nSubscribers: ${siteUrl}/admin/subscribers\n` (built with `new URL`).
  - HTML is the same content in `<html lang="en">`, every value escaped, with the URL as a link.
- Sending: one `OutgoingEmail`, `to: { name: "", address: adminEmail }`, with `replyTo` set to the reactor's or person's address and `headers: {}`. Neither function ever throws, and `mailer.close()` runs in `finally` whenever there's a mailer. Logs:
  - `"[notify] reaction email sent (post %s, user %s)"`
  - `"[notify] reaction email failed (post %s, user %s)"` plus `redactAddresses(error, [adminEmail, reactor.email])`
  - `"[notify] unsubscribe email sent (subscriber %s)"`
  - `"[notify] unsubscribe email failed (subscriber %s)"` plus the redacted message
  - `"[notify] %s email not sent: SMTP not configured"`, with `reaction` or `unsubscribe`
  - The reaction notice loads the post's title. If the post is gone: `"[notify] reaction email not sent: post %s not found"`.

- [ ] **Step 1: Write failing tests** (fake `Mailer` as in `send.test.ts`, PGlite for the post):

```ts
test("reaction notice: subject and text, exactly")
// reactor { name: "Erik", email: "erik@gmail.com" }, "❤️", post { id: "p1", title: "Milford Sound" }
// → subject "Erik reacted ❤️ to Milford Sound"; text "Erik (erik@gmail.com) reacted ❤️ to Milford Sound.\n\nSee the post: https://prytz.nz/?post=p1\n"
test("reaction notice with no name uses the address")      // subject "erik@gmail.com reacted ❤️ to Milford Sound"
test("unsubscribe notice: subject and text, exactly")
// → subject "Karin unsubscribed from new-post emails"; text "Karin (karin@example.se) unsubscribed from new-post emails.\n\nSubscribers: https://prytz.nz/admin/subscribers\n"
test("html escapes names and titles")                      // name "<b>Erik</b>", title "A & B" → html has "&lt;b&gt;Erik&lt;/b&gt;" and "A &amp; B", not "<b>Erik"   (Review Focus 4)
test("sendReactionNotice sends one email to the admin, reply-to the reactor, and closes")
test("sendReactionNotice for a deleted post sends nothing and logs")   // Review Focus 5
test("sendUnsubscribeNotice skips the admin's own address")           // "ADMIN@example.com" vs adminEmail "admin@example.com" → nothing sent
test("a failed send is logged without addresses and doesn't throw")    // error quotes both addresses
test("no SMTP → nothing sent, an info log")                            // both functions
```

- [ ] **Step 2: Run** `npx vitest run src/notify/admin-notices.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/notify/admin-notices.ts` (`import "server-only";` as in `send.ts`).
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit:** `git add src/notify/admin-notices* && git commit -m "feat: emails to the admin for reactions and unsubscribes"`

---

### Task 5: Send the admin emails

**Files:**
- Modify: `src/reactions/actions.ts`, `src/app/unsubscribe/actions.ts`, `src/app/unsubscribe/one-click/route.ts`, `README.md`

**Interfaces:**
- Consumes: `sendReactionNotice`, `sendUnsubscribeNotice`, `noticeDepsFromEnv` (Task 4). `setSubscribed` returning `SubscriptionChange | null` (Task 2). `after` from `next/server`.
- `toggleReactionAction`: when `toggleReaction` returns `"added"` and `!viewer.isAdmin`, call `after(() => sendReactionNotice({ db, ...noticeDepsFromEnv(getEnv()) }, { postId, emoji, reactor: viewer.user }))`.
- `setSubscriptionAction` and the one-click `POST`: when unsubscribing and `change?.changed`, call `after(() => sendUnsubscribeNotice(noticeDepsFromEnv(getEnv()), change.person))`. In the server action this must come before `redirect()`, which throws. The one-click route still answers `200` with no body for every token.
- README "Email" section: the subscriber page (add by address and name, remove, turn back on, the "bett om" footer for people you add), the email you get for each reaction (yours excluded) and each unsubscribe (yours excluded, not when you remove someone), and that both go to `ADMIN_EMAIL` even if you've unsubscribed.

- [ ] **Step 1: Wire the three call sites** as above.
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit`, `npm run lint`. Expected: PASS.
- [ ] **Step 3: Run** `npx playwright test e2e/reactions.spec.ts e2e/unsubscribe.spec.ts`. Expected: PASS. SMTP is off in e2e, so this shows the `after()` work doesn't break reacting or unsubscribing.
- [ ] **Step 4: Update the README.**
- [ ] **Step 5: Commit:** `git commit -am "feat: email the admin when someone reacts or unsubscribes"`

---

### Task 6: The `/admin/subscribers` page

**Files:**
- Create: `src/app/admin/(protected)/subscribers/page.tsx`, `src/components/admin/AddSubscriberForm.tsx`, `e2e/subscribers.spec.ts`
- Modify: `src/notify/actions.ts`, `src/app/admin/(protected)/page.tsx`, `src/app/admin/admin.module.css`, `e2e/admin-guard.spec.ts`

**Interfaces:**
- Consumes: everything from Task 3. `requireAdminPage` and `assertAdmin` (`src/auth/viewer.ts`). `refresh` from `next/cache`.
- Produces, in `src/notify/actions.ts` (`"use server"`, each one calls `await assertAdmin()` first):
  - `type AddSubscriberState = { ok: boolean; message: string; email: string; name: string } | null`
  - `addSubscriberAction(prev: AddSubscriberState, formData: FormData): Promise<AddSubscriberState>`. It reads the `email` and `name` fields, then runs `parseNewSubscriber` → `addSubscriberByAdmin` → `addSubscriberMessage`. `ok` is true only for `added`, and in that case it calls `refresh()`. The typed values come back in the state.
  - `removeSubscriberAction(formData: FormData): Promise<void>` and `resubscribeAction(formData: FormData): Promise<void>`. Each reads an `id` field, calls `setSubscribedById`, then `refresh()`.
- Page (server component), following the spec's sketch:
  - `<h1>` `Subscribers`, with a `← Posts` link to `/admin`.
  - The count line: `${count} get new-post emails`, or `1 gets new-post emails`.
  - `<AddSubscriberForm />`.
  - A `<ul>` of subscribed rows, each with name, address, note and a `Remove` button.
  - When there are unsubscribed rows, an `<h2>` `Unsubscribed` and a `<ul>` of them, each with a `Turn back on` button.
  - Data: `groupSubscribers(await listSubscribersForAdmin(getDb()), getEnv().ADMIN_EMAIL)`.
- `AddSubscriberForm` (`"use client"`), using `useActionState(addSubscriberAction, null)`:
  - Fields labelled `Name (optional)` (`name`) and `Email` (`email`, `type="email"`, `required`), and an `Add` button that's disabled while pending.
  - Below them, `<p role="status">` with the message, styled `styles.errorText` when `!ok`.
  - On a failure, the typed values stay in the fields: `defaultValue` comes from the state, and the form's `key` changes per result. After `Added …` the fields are empty.
- `/admin`: add a `Subscribers` link in the header, next to `View site`.

- [ ] **Step 1: Write the failing e2e** `e2e/subscribers.spec.ts` (`test.use({ storageState: ADMIN_STATE, viewport: { width: 390, height: 844 } })`; `afterAll` deletes the `anna@e2e.test` row via `postgres(E2E_ENV.DATABASE_URL)`):

```ts
test("add, refuse duplicates, remove, turn back on")
// /admin → click "Subscribers" → heading "Subscribers"
// fill Name "Anna Test", Email "Anna@E2E.test", Add → status "Added anna@e2e.test."; row "anna@e2e.test" contains "added by you"; Email field empty
// Email "anna@e2e.test", Add → "anna@e2e.test is already on the list."
// row Remove → row under "Unsubscribed" containing "removed by you"
// Email "anna@e2e.test", Add → "anna@e2e.test is on the list but unsubscribed. Use Turn back on below."
// Turn back on → row back in the subscribed list
test("an address the browser accepts but isn't one → message, fields kept")
// Email "anna@localhost" → "That isn't an email address."; Email field still "anna@localhost"
```

In `e2e/admin-guard.spec.ts`, extend the anonymous and non-admin tests to also visit `/admin/subscribers` and land on `/admin/login`.

- [ ] **Step 2: Run** `npx playwright test e2e/subscribers.spec.ts e2e/admin-guard.spec.ts`. Expected: FAIL (no link, no page).
- [ ] **Step 3: Implement** the actions, the page, the form, the `/admin` link and the styles. Reuse `.page`, `.header`, `.title`, `.list`, `.button`, `.secondary`, `.muted` and `.errorText`, and add only what rows with a button need.
- [ ] **Step 4: Run** the same e2e specs, then the full `npm run test:e2e`, `npm test`, `npm run lint` and `npx tsc --noEmit`. Expected: all PASS.
- [ ] **Step 5: Commit:** `git add -A src e2e && git commit -m "feat: subscriber list on /admin"`
