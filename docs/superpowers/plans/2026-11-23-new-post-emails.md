# New-post emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Vilhelm publishes a post for the first time, everyone who has ever reacted (and Vilhelm) gets a short Swedish email over SMTP, with an unsubscribe link that works without the family password.

**Architecture:** A `post_email_subscribers` table holds the list (joined on reaction or on publish, left only by unsubscribing). Publishing claims the post once via `posts.announced_at`, then `after()` sends one email per recipient through nodemailer, behind a small `Mailer` interface so tests use a fake. A public `/unsubscribe` page and an RFC 8058 one-click route flip `unsubscribed_at` by random token.

**Tech Stack:** Next.js 16 (App Router, server actions, `after` from `next/server`), Drizzle + PostgreSQL (PGlite in tests), nodemailer 10.6.1, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-new-post-emails-design.md`

## Global Constraints

- Before using a Next.js API, read its page under `node_modules/next/dist/docs/` (this Next version differs from training data). `after`: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`.
- Runtime dependencies are pinned to exact versions: add `"nodemailer": "10.6.1"` (no `^`). Don't add `@types/nodemailer`: nodemailer 10 ships its own types.
- Server-only modules start with `import "server-only";` (Vitest aliases it to an empty module).
- Swedish copy is verbatim from the spec; don't rephrase it. The site UI elsewhere stays English.
- Never log an email address. Log user ids and post ids.
- Sending must never make publishing fail or wait.
- Shutdown is already handled: the standalone `server.js` uses `next/dist/server/lib/start-server.js`, which on SIGTERM stops taking requests and awaits `nextServer.close()` (pending `after()` work) before exiting. Docker allows 10 seconds. Nothing to build.
- Migrations: generate with `npm run db:generate`, then append hand-written SQL to the generated file, separated by `--> statement-breakpoint` (as `drizzle/0003_dizzy_champions.sql` does).
- Checks for every task: `npm test`, `npm run lint`, `npx tsc --noEmit`. The e2e suite (`npm run test:e2e`) needs `docker compose -f docker-compose.dev.yml up -d db` and `npx playwright install chromium`.
- Commit messages follow the repo style (`feat: …`, `docs: …`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. `BETTER_AUTH_URL` set with a trailing slash (`https://prytz.nz/`): links must still be `https://prytz.nz/?post=…`, not `//?post=`. (Task 3 test.)
2. A late-evening post (`2026-11-14T23:30:00`): the email says `14 november 2026`, never the 15th, regardless of the server's time zone. (Task 3 test.)
3. Two Publish requests at once (double tap): exactly one claims the post and sends. (Task 6 test.)
4. Malformed unsubscribe links (`?t=a&t=b`, uppercase or truncated tokens, no `t`): the page says `Länken fungerar inte.` and never errors. (Task 7 tests.)
5. The one-click POST from a mail provider arrives with no cookies, no family password and no `Origin`: it must still unsubscribe and answer 200. (Task 7 e2e test.)

---

### Task 1: Data model and migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0005_<generated name>.sql`, `drizzle/meta/0005_snapshot.json`, updated `drizzle/meta/_journal.json` (all via `npm run db:generate`)
- Modify: `src/db/test-db.ts`
- Test: `src/db/migration-emails.test.ts`

**Interfaces:**
- Produces: `posts.announcedAt` (`timestamp("announced_at", { withTimezone: true })`, nullable).
- Produces: `postEmailSubscribers` table export with `userId` (text PK → `user.id`, cascade), `unsubscribeToken` (text, not null, unique, SQL default), `subscribedAt` (timestamptz, not null, default now), `unsubscribedAt` (timestamptz, nullable).
- Produces: `migrationsBefore(tagPrefix: string): Promise<string>` in `src/db/test-db.ts`, a temp copy of `drizzle/` whose journal stops before `tagPrefix` (lift the body of `migrationsBeforeClips` in `src/db/migration-video.test.ts`).

- [ ] **Step 1: Add the schema.** In `src/db/schema.ts` add `announcedAt` to `posts` and the new table. The token default is exactly:

```ts
sql`replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')`
```

(64 lowercase hex characters, about 244 random bits; Postgres draws `gen_random_uuid()` from a strong random source.) Import `sql` from `drizzle-orm`.

- [ ] **Step 2: Generate the migration.** Run `npm run db:generate`. Expected: a new `drizzle/0005_*.sql` creating `post_email_subscribers` with its FK and unique constraint, and `ALTER TABLE "posts" ADD COLUMN "announced_at"`.

- [ ] **Step 3: Append the backfill** to the end of that file (add `--> statement-breakpoint` after the last generated statement first):

```sql
-- Everyone who has reacted so far is on the list, each with their own token.
INSERT INTO "post_email_subscribers" ("user_id") SELECT DISTINCT "user_id" FROM "reactions";--> statement-breakpoint
-- Posts published before emails existed (including ones unpublished since) never send.
UPDATE "posts" SET "announced_at" = "published_at" WHERE "published_at" IS NOT NULL;
```

- [ ] **Step 4: Add `migrationsBefore` to `src/db/test-db.ts`, then write the failing test** `src/db/migration-emails.test.ts`:

```ts
test("existing reactors join the list; once-published posts count as announced", async () => {
  // migrate to migrationsBefore("0005_"), then via client.exec insert:
  //   users u1, u2, u3; posts pub (published, published_at 2026-10-01T00:00:00Z),
  //   was (draft, published_at 2026-10-02T00:00:00Z), dr (draft, published_at null);
  //   reactions u1→pub ❤️, u1→pub 👍, u2→pub 😂 (u3 none). Then migrate to the full folder.
  const subs = (await client.query("select user_id, unsubscribe_token, unsubscribed_at from post_email_subscribers order by user_id")).rows;
  expect(subs.map((r) => r.user_id)).toEqual(["u1", "u2"]);
  for (const r of subs) {
    expect(r.unsubscribe_token).toMatch(/^[0-9a-f]{64}$/);
    expect(r.unsubscribed_at).toBeNull();
  }
  expect(subs[0].unsubscribe_token).not.toBe(subs[1].unsubscribe_token);
  // announced_at equals published_at for pub and was; null for dr
});

test("a new subscriber gets a token by default", async () => {
  // createTestDb(), insert a user, insert postEmailSubscribers { userId } only
  // expect the row's unsubscribeToken toMatch(/^[0-9a-f]{64}$/)
});
```

- [ ] **Step 5: Run** `npx vitest run src/db/migration-emails.test.ts`. Expected: PASS. (Steps 1 to 3 come before the test because the test needs the generated migration. To see it fail, comment out the appended SQL once: the first test fails on an empty list.)

- [ ] **Step 6: Run** `npm test && npm run lint && npx tsc --noEmit`. Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/test-db.ts src/db/migration-emails.test.ts drizzle/
git commit -m "feat: store who gets new-post emails and which posts were announced"
```

---

### Task 2: The subscriber list

**Files:**
- Create: `src/notify/subscribers.ts`
- Modify: `src/reactions/repo.ts` (`toggleReaction`)
- Test: `src/notify/subscribers.test.ts`, `src/reactions/repo.test.ts`

**Interfaces:**
- Consumes: `postEmailSubscribers`, `user` from `@/db/schema`; `Db` from `@/db/client`.
- Produces:
  - `addSubscriber(db: Db, userId: string): Promise<void>`: insert with `onConflictDoNothing()`, so an existing row (subscribed or not) is untouched.
  - `type Recipient = { userId: string; email: string; name: string; unsubscribeToken: string }`
  - `listRecipients(db: Db): Promise<Recipient[]>`: rows with `unsubscribed_at is null`, joined to `user` with `email_verified = true`.
  - `getSubscription(db: Db, token: string): Promise<{ subscribed: boolean } | null>`: `null` for an unknown token.
  - `setSubscribed(db: Db, token: string, subscribed: boolean, now: Date): Promise<boolean>`: sets `unsubscribed_at` to `now` or `null`; returns `false` for an unknown token.

- [ ] **Step 1: Write failing tests** in `src/notify/subscribers.test.ts` (users inserted directly, as in `src/reactions/repo.test.ts`):

```ts
test("adding twice keeps one row and the same token")
test("recipients: verified and subscribed only", async () => {
  // a: verified, subscribed; b: verified, unsubscribed via setSubscribed(..., false, NOW); c: unverified, subscribed
  expect((await listRecipients(db)).map((r) => r.userId)).toEqual(["a"]);
  expect((await listRecipients(db))[0]).toMatchObject({ email: "a@example.com", name: "Anna Svensson" });
})
test("unsubscribe sticks when the person is added again; undo resubscribes", async () => {
  // setSubscribed(token, false) → getSubscription → { subscribed: false }
  // addSubscriber(same user) → still { subscribed: false }
  // setSubscribed(token, true) → { subscribed: true }
})
test("unknown token: getSubscription → null, setSubscribed → false")
```

- [ ] **Step 2: Add to `src/reactions/repo.test.ts`:**

```ts
test("reacting puts the person on the email list; taking it back keeps them there", async () => {
  await toggleReaction(db, { postId, userId, emoji: "❤️" });
  await toggleReaction(db, { postId, userId, emoji: "❤️" });
  expect(await db.select().from(postEmailSubscribers)).toMatchObject([{ userId }]);
});
test("a rejected reaction (draft post) adds nobody") // expect the table to be empty
```

- [ ] **Step 3: Run** `npx vitest run src/notify src/reactions`. Expected: FAIL (module `./subscribers` not found).

- [ ] **Step 4: Implement** the four functions in `src/notify/subscribers.ts`, and in `toggleReaction` call `addSubscriber(db, input.userId)` after the insert, on the `"added"` path only.

- [ ] **Step 5: Run** `npx vitest run src/notify src/reactions`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/notify/subscribers.ts src/notify/subscribers.test.ts src/reactions/repo.ts src/reactions/repo.test.ts
git commit -m "feat: reacting puts readers on the new-post email list"
```

---

### Task 3: The email's content

**Files:**
- Create: `src/notify/email.ts`
- Test: `src/notify/email.test.ts`

**Interfaces:**
- Produces:
  - `type AnnouncedPost = { id: string; title: string; placeName: string; takenAtLocal: string }`
  - `type NewPostEmailInput = { siteUrl: string; post: AnnouncedPost; recipientName: string; unsubscribeToken: string }`
  - `type NewPostEmail = { subject: string; text: string; html: string; postUrl: string; unsubscribeUrl: string; oneClickUrl: string }`
  - `buildNewPostEmail(input: NewPostEmailInput): NewPostEmail`
- URLs are built with `new URL(path, siteUrl)`: `/?post=<id>`, `/unsubscribe?t=<token>`, `/unsubscribe/one-click?t=<token>`.
- Date: `new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })` applied to `` new Date(`${takenAtLocal.slice(0, 19)}Z`) `` (the same trick as `formatPostDate` in `src/posts/format.ts`).
- Greeting: the first whitespace-separated word of `recipientName.trim()`; `Hej <word>!`, or `Hej!` when there is none.
- Place line: `<placeName> · <date>` when `placeName.trim()` isn't empty, otherwise just `<date>`.
- `prytz.nz` in the copy is a fixed string, not derived from `siteUrl`.
- HTML: a small `lang="sv"` document with inline styles, the same lines as the text, a link styled as a button with the text `Se inlägget` pointing at `postUrl`, and the footer link `Sluta få de här mejlen` pointing at `unsubscribeUrl`. Every interpolated value is escaped (`&`, `<`, `>`, `"`, `'`).

- [ ] **Step 1: Write failing tests:**

```ts
const base = {
  siteUrl: "https://prytz.nz",
  post: { id: "p1", title: "Milford Sound", placeName: "Fiordland, New Zealand", takenAtLocal: "2026-11-14T10:00:00" },
  recipientName: "Anna Svensson",
  unsubscribeToken: "a".repeat(64),
};

test("subject and plain text, exactly", () => {
  const email = buildNewPostEmail(base);
  expect(email.subject).toBe("Nytt inlägg: Milford Sound");
  expect(email.text).toBe(
    [
      "Hej Anna!",
      "",
      "Det finns ett nytt inlägg på prytz.nz:",
      "",
      "Milford Sound",
      "Fiordland, New Zealand · 14 november 2026",
      "",
      "Se inlägget: https://prytz.nz/?post=p1",
      "",
      "Du får det här mejlet eftersom du har reagerat på ett inlägg på prytz.nz.",
      `Sluta få de här mejlen: https://prytz.nz/unsubscribe?t=${"a".repeat(64)}`,
      "",
    ].join("\n"),
  );
  expect(email.oneClickUrl).toBe(`https://prytz.nz/unsubscribe/one-click?t=${"a".repeat(64)}`);
});
test("no place name → the line is only the date")            // "14 november 2026" on its own line
test.each([["", "Hej!"], ["   ", "Hej!"], ["  Åsa  Prytz ", "Hej Åsa!"]])("greeting for %j", ...)
test("late evening stays on the same day")                    // takenAtLocal "2026-11-14T23:30:00" → "14 november 2026"
test("trailing slash on siteUrl", () => {                     // siteUrl "https://prytz.nz/"
  expect(buildNewPostEmail({ ...base, siteUrl: "https://prytz.nz/" }).postUrl).toBe("https://prytz.nz/?post=p1");
});
test("html escapes title, place and name and links both URLs", () => {
  const email = buildNewPostEmail({ ...base, post: { ...base.post, title: `<b>Tom & "Jerry"</b>`, placeName: "<i>x</i>" }, recipientName: "<script>" });
  expect(email.html).toContain("&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;");
  expect(email.html).not.toContain("<b>Tom");
  expect(email.html).not.toContain("<script>");
  expect(email.html).toContain(`href="https://prytz.nz/?post=p1"`);
  expect(email.html).toContain(`href="https://prytz.nz/unsubscribe?t=${"a".repeat(64)}"`);
  expect(email.html).toContain("Se inlägget");
  expect(email.subject).toBe(`Nytt inlägg: <b>Tom & "Jerry"</b>`); // a header, not HTML
});
```

- [ ] **Step 2: Run** `npx vitest run src/notify/email.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `buildNewPostEmail` in `src/notify/email.ts` (a pure module; no `server-only` needed).

- [ ] **Step 4: Run** `npx vitest run src/notify/email.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notify/email.ts src/notify/email.test.ts
git commit -m "feat: write the Swedish new-post email"
```

---

### Task 4: SMTP settings, connection and startup check

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm install --save-exact nodemailer@10.6.1`)
- Modify: `src/env.ts`, `src/env.test.ts`
- Create: `src/notify/smtp.ts`, `src/notify/smtp.test.ts`
- Modify: `src/instrumentation.ts`
- Modify: `docker-compose.dev.yml`, `.env.example`, `README.md`

**Interfaces:**
- Produces in `Env`: `SMTP_HOST?: string`, `SMTP_PORT: number` (default `587`), `SMTP_SECURITY: "starttls" | "tls" | "none"` (default `"starttls"`), `SMTP_USER?: string`, `SMTP_PASSWORD?: string`, `SMTP_FROM?: string`. In `superRefine` (like the S3 check): when `SMTP_HOST` is set, `SMTP_FROM` is required; `SMTP_USER` and `SMTP_PASSWORD` are both set or both unset. An empty string counts as unset.
- Produces in `src/notify/smtp.ts`:
  - `type OutgoingEmail = { from: string; to: { name: string; address: string }; replyTo: string; subject: string; text: string; html: string; headers: Record<string, string> }`
  - `type Mailer = { send(email: OutgoingEmail): Promise<void>; verify(): Promise<void>; close(): void }`
  - `smtpOptions(env: Env)`: returns the nodemailer SMTP options: `host`, `port`, `secure: security === "tls"`, `requireTLS: security === "starttls"`, `ignoreTLS: security === "none"`, `auth: { user, pass }` only when `SMTP_USER` is set, `connectionTimeout: 15_000`, `greetingTimeout: 15_000`, `socketTimeout: 30_000`.
  - `createMailer(env: Env): Mailer | null`: `null` when `SMTP_HOST` is unset; otherwise wraps `nodemailer.createTransport(smtpOptions(env))`.
  - `checkSmtp(mailer: Mailer | null, log?: Pick<Console, "info" | "error">): Promise<void>`: does nothing for `null`; otherwise `verify()`, then logs `[smtp] ok` or `[smtp] check failed` with the error, and always calls `close()`. It never throws.

- [ ] **Step 1: Write failing tests.** In `src/env.test.ts`:

```ts
test("SMTP is off by default, with defaults", () => {
  const env = parseEnv({ ...base, STORAGE_DRIVER: "fs" });
  expect(env.SMTP_HOST).toBeFalsy();
  expect(env.SMTP_PORT).toBe(587);
  expect(env.SMTP_SECURITY).toBe("starttls");
});
test("SMTP_HOST without SMTP_FROM throws naming it")       // toThrow(/SMTP_FROM/)
test("SMTP_USER without SMTP_PASSWORD throws naming it")    // toThrow(/SMTP_PASSWORD/)
test("unknown SMTP_SECURITY is rejected")                    // "ssl" → toThrow()
test("host, from and credentials parse")                     // SMTP_PORT "465" → 465
```

In `src/notify/smtp.test.ts`:

```ts
test.each([
  ["starttls", { secure: false, requireTLS: true, ignoreTLS: false }],
  ["tls", { secure: true, requireTLS: false, ignoreTLS: false }],
  ["none", { secure: false, requireTLS: false, ignoreTLS: true }],
])("security %s", ...)                                          // smtpOptions(...) toMatchObject
test("no credentials → no auth; timeouts always set")         // auth undefined; connectionTimeout 15000, greetingTimeout 15000, socketTimeout 30000
test("createMailer without SMTP_HOST → null")
test("checkSmtp logs ok and closes")                           // fake mailer; info called with "[smtp] ok"; close called once
test("checkSmtp logs a failure, closes, and doesn't throw")    // verify rejects; error called with "[smtp] check failed", err
```

- [ ] **Step 2: Run** `npx vitest run src/env.test.ts src/notify/smtp.test.ts`. Expected: FAIL.

- [ ] **Step 3: Install nodemailer** with `npm install --save-exact nodemailer@10.6.1`, then implement the env fields and `src/notify/smtp.ts` (`import "server-only";`). In `src/instrumentation.ts`, after the upload cleanup, add `checkSmtp(createMailer(getEnv()))` inside its own `try`, using dynamic imports like the existing code.

- [ ] **Step 4: Run** `npx vitest run src/env.test.ts src/notify/smtp.test.ts`. Expected: PASS.

- [ ] **Step 5: Local mail and docs.**
  - `docker-compose.dev.yml`: add a `mailpit` service, image `axllent/mailpit` pinned to its current release tag, with ports `1025:1025` (SMTP) and `8025:8025` (inbox UI).
  - `.env.example`: an `# --- Email (new-post notifications). Empty SMTP_HOST turns emails off. ---` section listing the six variables with one-line comments, plus a commented local block: `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURITY=none`, `SMTP_FROM="prytz.nz <noreply@localhost>"`.
  - `README.md`:
    - Local development: `docker compose -f docker-compose.dev.yml up -d mailpit`, with emails visible at http://localhost:8025.
    - Deploying on Dokploy → Environment: the SMTP variables.
    - A new "Email" section: who gets emails (anyone who has reacted, plus the admin; one email per post's first publish, in Swedish; replies go to `ADMIN_EMAIL`), and that the sender domain needs SPF and DKIM as the SMTP provider describes.
    - First-deploy checks: look for `[smtp] ok` in the application log. Don't suggest a test post, because it would email everyone.

- [ ] **Step 6: Run** `npm test && npm run lint && npx tsc --noEmit && npm run build`. Expected: all pass, and the build doesn't need any SMTP variables.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/env.ts src/env.test.ts src/notify/smtp.ts src/notify/smtp.test.ts src/instrumentation.ts docker-compose.dev.yml .env.example README.md
git commit -m "feat: SMTP settings, with a connection check at startup"
```

---

### Task 5: Sending to the list

**Files:**
- Create: `src/notify/send.ts`
- Test: `src/notify/send.test.ts`

**Interfaces:**
- Consumes: `listRecipients`, `Recipient` (Task 2); `buildNewPostEmail`, `AnnouncedPost` (Task 3); `Mailer`, `OutgoingEmail`, `createMailer` (Task 4); `Env`.
- Produces:
  - `type SendDeps = { db: Db; mailer: Mailer | null; siteUrl: string; from: string; replyTo: string; log?: Pick<Console, "info" | "error"> }` (`log` defaults to `console`)
  - `sendDepsFromEnv(db: Db, env: Env): SendDeps`: `mailer: createMailer(env)`, `siteUrl: env.BETTER_AUTH_URL`, `from: env.SMTP_FROM ?? ""`, `replyTo: env.ADMIN_EMAIL`.
  - `sendNewPostEmails(deps: SendDeps, post: AnnouncedPost): Promise<{ sent: number; failed: number }>`. It never throws.
- Behaviour:
  - `mailer === null`: `log.info("[notify] post %s: SMTP not configured, no emails sent", post.id)`, then return `{ sent: 0, failed: 0 }`.
  - Otherwise, one `mailer.send` per recipient, in turn: `to: { name, address: email }`, `from`, `replyTo`, `subject`/`text`/`html` from `buildNewPostEmail`, and `headers: { "List-Unsubscribe": \`<${oneClickUrl}>\`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }`.
  - A failed send: `log.error("[notify] post %s: sending to user %s failed", post.id, userId, error)`, then continue.
  - At the end: `log.info("[notify] post %s: sent %d, failed %d", …)`.
  - Any other error (for example the recipient query): `log.error("[notify] post %s: sending failed", post.id, error)`.
  - `mailer.close()` runs once, always (in `finally`).

- [ ] **Step 1: Write failing tests** with `createTestDb()` and a fake mailer that records `OutgoingEmail`s:

```ts
test("one email per verified, subscribed recipient, with headers and reply-to", async () => {
  // users a (verified), b (verified, unsubscribed), c (unverified), all added as subscribers
  const result = await sendNewPostEmails(deps, post);
  expect(result).toEqual({ sent: 1, failed: 0 });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    to: { name: "Anna Svensson", address: "a@example.com" },
    from: "prytz.nz <noreply@prytz.nz>",
    replyTo: "admin@example.com",
    subject: "Nytt inlägg: Milford Sound",
    headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  expect(sent[0].headers["List-Unsubscribe"]).toMatch(/^<https:\/\/prytz\.nz\/unsubscribe\/one-click\?t=[0-9a-f]{64}>$/);
  expect(closeCalls).toBe(1);
});
test("a failure for one recipient doesn't stop the rest, and its log has no address", async () => {
  // two verified recipients; the fake rejects for the first address
  // expect { sent: 1, failed: 1 }; the second address received
  // expect(JSON.stringify(log.error.mock.calls)).not.toContain("@example.com")
});
test("no SMTP → nothing sent, an info log, no throw")         // mailer null → { sent: 0, failed: 0 }; info matches /SMTP not configured/
```

- [ ] **Step 2: Run** `npx vitest run src/notify/send.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `src/notify/send.ts` (`import "server-only";`).

- [ ] **Step 4: Run** `npx vitest run src/notify/send.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notify/send.ts src/notify/send.test.ts
git commit -m "feat: send the new-post email to everyone on the list"
```

---

### Task 6: Publishing claims the post and sends

**Files:**
- Modify: `src/posts/repo.ts` (add `claimAnnouncement`)
- Create: `src/notify/announce.ts`
- Modify: `src/posts/actions.ts` (`publishAction`)
- Test: `src/posts/repo.test.ts`, `src/notify/announce.test.ts`

**Interfaces:**
- Consumes: `addSubscriber` (Task 2), `AnnouncedPost` (Task 3), `sendNewPostEmails`, `sendDepsFromEnv` (Task 5), `assertAdmin` (returns `ViewerUser` with `id`), `after` from `next/server`.
- Produces:
  - `claimAnnouncement(db: Db, postId: string, now: Date): Promise<AnnouncedPost | null>` in `src/posts/repo.ts`: one `UPDATE posts SET announced_at = now WHERE id = postId AND status = 'published' AND announced_at IS NULL AND taken_at_local IS NOT NULL RETURNING id, title, place_name, taken_at_local`. Returns `null` when no row comes back. Normalise `takenAtLocal` with the file's existing `isoLocal` helper (Postgres returns `2026-11-14 10:00:00`; the email wants `2026-11-14T10:00:00`).
  - `announceNewPost(db: Db, input: { postId: string; adminUserId: string; now: Date }): Promise<AnnouncedPost | null>` in `src/notify/announce.ts`: `addSubscriber(db, adminUserId)`, then `claimAnnouncement`.
- `publishAction(id)`: `const admin = await assertAdmin()`, then `setPublished(db, id, true, now)`. If that's `ok`, call `announceNewPost`; when it returns a post, `after(() => sendNewPostEmails(sendDepsFromEnv(db, getEnv()), post))`. Return the `setPublished` result unchanged. `unpublishAction` is unchanged.

- [ ] **Step 1: Write failing tests.** In `src/posts/repo.test.ts`, using `makePublished`:

```ts
test("claim: the first claim returns the post, later ones null", async () => {
  const id = await makePublished("Milford Sound", "2026-11-14T10:00:00", 1);
  expect(await claimAnnouncement(db, id, NOW)).toEqual({
    id, title: "Milford Sound", placeName: "Somewhere", takenAtLocal: "2026-11-14T10:00:00",
  });
  expect(await claimAnnouncement(db, id, NOW)).toBeNull();
});
test("claim: drafts are never claimed")                      // createDraft → null
test("claim: unpublish then publish again doesn't claim twice") // claim, setPublished false, setPublished true, claim → null
test("claim: two at once → exactly one wins", async () => {
  const id = await makePublished("X", "2026-11-14T10:00:00", 1);
  const results = await Promise.all([claimAnnouncement(db, id, NOW), claimAnnouncement(db, id, NOW)]);
  expect(results.filter(Boolean)).toHaveLength(1);
});
```

In `src/notify/announce.test.ts`:

```ts
test("publishing puts the admin on the list and claims the post")
test("an admin who unsubscribed stays unsubscribed")         // setSubscribed(token, false) first; after announceNewPost, getSubscription → { subscribed: false }
```

Post setup for `announce.test.ts`: insert a `published` post row directly, with `takenAtLocal` set.

- [ ] **Step 2: Run** `npx vitest run src/posts/repo.test.ts src/notify/announce.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `claimAnnouncement`, `announceNewPost` and the `publishAction` change. Read the `after` doc first (see Global Constraints).

- [ ] **Step 4: Run** `npm test && npm run lint && npx tsc --noEmit`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/posts/repo.ts src/posts/repo.test.ts src/notify/announce.ts src/notify/announce.test.ts src/posts/actions.ts
git commit -m "feat: email the list when a post is published for the first time"
```

---

### Task 7: Unsubscribe page and one-click link

**Files:**
- Modify: `src/gate/paths.ts` (add `"/unsubscribe"` to `PUBLIC`), `src/gate/paths.test.ts`
- Create: `src/notify/token.ts`, `src/notify/token.test.ts`
- Create: `src/app/unsubscribe/page.tsx`, `src/app/unsubscribe/actions.ts`
- Create: `src/app/unsubscribe/one-click/route.ts`
- Test: `e2e/unsubscribe.spec.ts`

**Interfaces:**
- Consumes: `getSubscription`, `setSubscribed` (Task 2).
- Produces:
  - `parseUnsubscribeToken(value: string | string[] | null | undefined): string | null` in `src/notify/token.ts`: returns `value` only if it's a single string matching `/^[0-9a-f]{64}$/`, otherwise `null`.
  - `setSubscriptionAction(formData: FormData): Promise<never>` in `src/app/unsubscribe/actions.ts` (`"use server"`): reads `t` and `subscribed` (`"1"` or `"0"`), calls `setSubscribed` only for a valid token, then `redirect` to `/unsubscribe?t=<token>` (or `/unsubscribe` for a bad token). It doesn't call `assertReader`: the token is the only authorization.
- Page `/unsubscribe`:
  - A server component that reads `t` from `searchParams`, runs `parseUnsubscribeToken`, then `getSubscription`.
  - It renders `<main lang="sv">` with the `page`/`card`/`title`/`button` classes from `../unlock/unlock.module.css` and an `h1` reading `prytz.nz`.
  - It shows exactly one state, with plain `<form action={setSubscriptionAction}>` forms (hidden `t` and `subscribed` inputs) so it works before hydration:
    - Subscribed: `Vill du sluta få mejl om nya inlägg på prytz.nz?` and the button `Sluta skicka mejl` (`subscribed=0`).
    - Unsubscribed: `Klart. Du får inga fler mejl om nya inlägg.` and the button `Ångra` (`subscribed=1`).
    - Bad, unknown or missing token: `Länken fungerar inte.` and no form.
  - It shows no email address and no journal content.
- Route `/unsubscribe/one-click`:
  - `POST`: if `parseUnsubscribeToken(searchParams.get("t"))` is valid, `setSubscribed(db, token, false, new Date())`. Always answer `new Response(null, { status: 200 })`.
  - `GET`: redirect (303) to `/unsubscribe` with the same query string.

- [ ] **Step 1: Write failing unit tests.**

```ts
// src/notify/token.test.ts
test.each([
  ["a".repeat(64), "a".repeat(64)],
  ["A".repeat(64), null], ["a".repeat(63), null], ["a".repeat(65), null], ["g".repeat(64), null],
  [["a".repeat(64), "b".repeat(64)], null], [undefined, null], [null, null], ["", null],
])("parse %j", (input, expected) => expect(parseUnsubscribeToken(input)).toBe(expected));

// src/gate/paths.test.ts: add "/unsubscribe" and "/unsubscribe/one-click" → "public";
// "/unsubscribed" → "reader" (prefix match is per path segment)
```

- [ ] **Step 2: Run** `npx vitest run src/notify/token.test.ts src/gate/paths.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `parseUnsubscribeToken` and the `PUBLIC` entry. **Run** the same command again. Expected: PASS.

- [ ] **Step 4: Write the e2e test** `e2e/unsubscribe.spec.ts`. Set up the token in `beforeAll` with `postgres(E2E_ENV.DATABASE_URL)`: insert the `reader@e2e.test` user's subscriber row (`insert … select id from "user" where email = 'reader@e2e.test' on conflict do nothing`), then read its `unsubscribe_token`. In `afterAll`, reset `unsubscribed_at` to null. Use the default context: no gate cookie, no storage state.

```ts
test("unsubscribe and undo without the family password", async ({ page }) => {
  await page.goto(`/unsubscribe?t=${token}`);
  await expect(page).toHaveURL(/\/unsubscribe\?t=/);            // not bounced to /unlock
  await expect(page.getByText("Vill du sluta få mejl om nya inlägg på prytz.nz?")).toBeVisible();
  await page.getByRole("button", { name: "Sluta skicka mejl" }).click();
  await expect(page.getByText("Klart. Du får inga fler mejl om nya inlägg.")).toBeVisible();
  // DB: unsubscribed_at is not null
  await page.getByRole("button", { name: "Ångra" }).click();
  await expect(page.getByText("Vill du sluta få mejl om nya inlägg på prytz.nz?")).toBeVisible();
  // DB: unsubscribed_at is null
});
test("opening the link changes nothing")                       // goto the page; DB unsubscribed_at still null
test("bad links", ...)                                          // "/unsubscribe?t=nope", "/unsubscribe", `/unsubscribe?t=${token}&t=${token}` → "Länken fungerar inte."
test("one-click POST from a mail provider", async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: E2E_BASE_URL }); // no cookies, no Origin
  const res = await api.post(`/unsubscribe/one-click?t=${token}`, { form: { "List-Unsubscribe": "One-Click" } });
  expect(res.status()).toBe(200);
  // DB: unsubscribed_at is not null; then reset it to null
  expect((await api.post(`/unsubscribe/one-click?t=${"0".repeat(64)}`, { form: { "List-Unsubscribe": "One-Click" } })).status()).toBe(200);
  const get = await api.get(`/unsubscribe/one-click?t=${token}`, { maxRedirects: 0 });
  expect(get.status()).toBe(303);
  expect(get.headers()["location"]).toMatch(/\/unsubscribe\?t=[0-9a-f]{64}$/);
});
```

- [ ] **Step 5: Implement** the page, the action and the route.

- [ ] **Step 6: Run** the e2e suite (start the compose db first): `npm run test:e2e`. Expected: all pass, including the existing `admin.spec.ts` publishing tests. With no SMTP configured, the server logs `SMTP not configured, no emails sent`.

- [ ] **Step 7: Run** `npm test && npm run lint && npx tsc --noEmit`. Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/gate/paths.ts src/gate/paths.test.ts src/notify/token.ts src/notify/token.test.ts src/app/unsubscribe e2e/unsubscribe.spec.ts
git commit -m "feat: unsubscribe from new-post emails without the family password"
```

---

### Task 8: End-to-end check with a real SMTP server (local)

**Files:** none changed unless a bug turns up.

- [ ] **Step 1:** `docker compose -f docker-compose.dev.yml up -d db mailpit`. In `.env.local`, set the local Mailpit block from `.env.example`, then run `npm run dev`. Expected: the log shows `[smtp] ok`.
- [ ] **Step 2:** Sign in as admin, react to any published post, then create and publish a new post. Expected: the log shows `[notify] post <id>: sent N, failed 0`. In http://localhost:8025, one email per recipient, Swedish text and HTML, `Reply-To` set to `ADMIN_EMAIL`, and both `List-Unsubscribe` headers present.
- [ ] **Step 3:** Unpublish and publish the same post again. Expected: no new email.
- [ ] **Step 4:** Open the email's `Se inlägget` link in a private window. Expected: the password page, then the feed focused on that post. Open `Sluta få de här mejlen`. Expected: the Swedish unsubscribe page, without the password.
