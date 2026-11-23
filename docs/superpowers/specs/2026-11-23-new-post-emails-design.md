# New-post emails: design

Date: 2026-11-23
Status: reviewed by a builder (nothing open), awaiting Vilhelm's approval
Builds on: `docs/superpowers/specs/2026-10-27-travel-journal-design.md` (the site as built: password-gated feed, Google sign-in to react, one admin). Email notifications were a non-goal for v1; this adds them.

## Why

When Vilhelm publishes a new post, the people who have shown interest by reacting should hear about it, so they come and look. The email is a nudge ("new post, come look"), not a summary: it carries no photos and links back to the site.

## What success looks like

- Vilhelm publishes a post from the phone. Publishing stays instant.
- Within a minute, everyone on the list (Vilhelm included) gets one short Swedish email with the post's title, place and date, and a link that opens the feed at that post.
- Anyone can stop the emails from a link in the email, without signing in, and undo it.
- Vilhelm's own copy of the email is the check that sending works.

## Anti-goals

- Photos, or any link that reaches photos without the family password, in the email.
- A second email for the same post (republishing after a fix, a double tap on Publish).
- Emails for posts that were already published before this ships.
- People on the list with no way to stop the emails.
- A visit to the unsubscribe link changing anything by itself (mail scanners open links).
- Publishing failing or slowing down because sending failed.

## Non-goals

- A summary or the description in the email; an English version.
- An admin screen for the list, or showing send results in the editor.
- Retrying failed sends, or a queue that survives crashes (approach C below).
- Emails for anything other than a post's first publish (edits, reactions, comments).
- A way to skip the email for one post (for example a backfilled stop).
- Telling readers on the site that reacting puts them on the list. The email's footer says why they got it.
- A "send me a test email" button.

## Decided by Vilhelm

- **Trigger:** publishing a post. Only the first time a post is published. Backfilled posts (older stops added later) email everyone too, with their own date.
- **Who gets it:** everyone who has ever reacted to any post, with any of the five emoji. Once someone reacts, they stay on the list until they unsubscribe; taking a reaction back or a post being deleted doesn't remove them.
- **Vilhelm is always on the list**, as a check that it works: publishing adds the admin if they aren't on it yet. If Vilhelm unsubscribes, that sticks like for anyone else.
- **Replies go to Vilhelm:** `Reply-To` is `ADMIN_EMAIL`.
- **No notice on the site** that reacting means emails; the email's footer explains it.
- **Content:** a short "new post, come look" email, no photos, in **Swedish**, as sketched below.
- **Unsubscribe link** in every email; it needs no sign-in, and the page can undo it.
- **Sending:** over regular SMTP.
- **Approach B** (below): Publish returns at once and the server sends right after.

## Approaches considered

- **A. Send inside Publish.** The editor waits for every email, then shows "Emailed 14 people" or failures. Direct feedback, but Publish gets slower as the list grows, and on a dropped phone connection the result is lost.
- **B. Send right after Publish returns, in the same server process (chosen).** Next.js `after()` runs work once the response is sent; per `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`, a graceful shutdown (SIGTERM) finishes pending `after()` work, so a normal redeploy doesn't cut sending off. No result in the editor; failures go to the server log, and Vilhelm's own copy shows it worked. Once the SMTP server accepts a message, delivery retries are its job; the app only loses emails if the SMTP server is unreachable at that moment.
- **C. Outbox table and a worker.** One row per recipient, a loop that sends and retries, surviving crashes. Sturdiest, but the most code for a few dozen emails, guarding against a rare failure.

Vilhelm picked B: publishing stays instant, and C's extra machinery isn't worth it at this size.

## The email

One email per recipient (not BCC), because each has a personal greeting and unsubscribe link. Plain text plus a simple HTML version with the same content.

```
From:     prytz.nz <SMTP_FROM address>
Reply-To: ADMIN_EMAIL
Subject:  Nytt inlägg: Milford Sound

Hej Anna!

Det finns ett nytt inlägg på prytz.nz:

  Milford Sound
  Fiordland, New Zealand · 14 november 2026

  [ Se inlägget ]  → https://prytz.nz/?post=<post id>

Du får det här mejlet eftersom du har reagerat på ett inlägg på prytz.nz.
Sluta få de här mejlen: https://prytz.nz/unsubscribe?t=<token>
```

- **Title, place, date** come from the post. Publishing already requires a title, a location and a date. The place name can be empty (reverse geocoding failed or is off); then the line is only the date. The place name is used as stored (it isn't translated).
- **Date:** the post's `taken_at_local` in Swedish long form, `14 november 2026` (`Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })`, formatted as UTC because the value is a wall clock, like `formatPostDate`).
- **Greeting:** `Hej <first name>!`, where the first name is the first word of the user's name. With no name: `Hej!`. *(Claude's call.)*
- **Link:** `<BETTER_AUTH_URL>/?post=<id>`. That already loads the feed through that post and focuses it, and a reader without the password cookie goes through `/unlock` and lands back on it (the proxy keeps `next`).
- **The HTML version** escapes every value (title, place, name): titles come from the admin and names from Google accounts.
- **Headers:** `List-Unsubscribe: <https://…/unsubscribe/one-click?t=<token>>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), so mail apps can show their own unsubscribe button and mail providers trust the email more. *(Claude's call.)*

## Who is on the list

- A new table, `post_email_subscribers`: `user_id` (primary key, references `user`, cascade on delete), `unsubscribe_token` (unique, not null), `subscribed_at`, `unsubscribed_at` (null while subscribed).
- **Joining:** when `toggleReaction` adds a reaction, the user is inserted if they aren't there yet (`on conflict do nothing`). Removing a reaction never touches the list.
- **The admin joins on publish:** `publishAction` inserts the signed-in admin (the user `assertAdmin` returns) the same way, before the recipients are loaded. The SQL migration can't read `ADMIN_EMAIL`, so this happens in app code.
- **Unsubscribed stays unsubscribed:** reacting again doesn't resubscribe anyone (the insert does nothing for an existing row). Only the page's undo button resubscribes. *(Claude's call.)*
- **At send time**, recipients are rows with `unsubscribed_at is null`, joined to `user` for the current email and name, **only where `email_verified` is true**. Google sign-ins are always verified; this keeps the e2e-only email/password accounts out. *(Claude's call.)*
- **Tokens** are random (at least 128 bits), stored in the table, and never expire, so links in old emails keep working. They don't depend on `BETTER_AUTH_SECRET`, so rotating it doesn't break them. *(Claude's call; earlier in the conversation this was described as a signed token.)*
- **Migration:** creates the table and adds everyone who has a reaction today, each with their own token. Runs at container start like the others.

## Publishing and sending

- A new column `posts.announced_at` (timestamptz, null). The **migration sets `announced_at = published_at`** for every post that has a `published_at`. That covers posts published today and posts that were published once and are now unpublished, so neither triggers an email later.
- **Claim:** after `setPublished` succeeds in `publishAction`, one atomic statement sets `announced_at = now` where the post is published and `announced_at is null`, returning the post's title, place name and date. Only the request that gets a row back sends. This is what stops double taps, races and republishing from sending twice.
- **Send:** `publishAction` passes the claimed post to `after()`, which loads the recipients and sends to each in turn over one SMTP connection. A failure for one recipient is logged and the rest continue. At the end, one log line: `[notify] post <id>: sent N, failed M`. Failures log the user id and the error, not the address. *(Claude's call.)*
- **SMTP off:** if `SMTP_HOST` is empty, the post is still claimed, and the log says no email was sent because SMTP isn't configured. Posts published while SMTP is off are never emailed later. *(Claude's call: keeps local dev and e2e working without SMTP.)*
- **Timeouts** on the SMTP connection so a hanging server can't hold the `after()` work forever.
- **Startup check:** when `SMTP_HOST` is set, `src/instrumentation.ts` checks the connection and login (nodemailer's `verify()`) and logs `[smtp] ok` or the error. A failure must not stop the site. This catches a wrong setting at deploy time, before the first real post's emails are lost. *(Claude's call.)*
- **Library:** `nodemailer` (10.6.1, no dependencies, ships its own types), pinned exactly like the other dependencies. *(Claude's call.)*

## Unsubscribe page

- **`/unsubscribe?t=<token>`**, in Swedish (content marked `lang="sv"`), styled like the unlock page. It's added to the public paths in `src/gate/paths.ts` so it works without the family password. It shows no journal content and doesn't show the email address.
- **Opening it changes nothing.** It shows a question and a button; pressing the button (a server action) sets `unsubscribed_at`. *(Claude's call: mail scanners open links, and must not unsubscribe people.)*
- States:
  - Subscribed: `Vill du sluta få mejl om nya inlägg på prytz.nz?` and the button `Sluta skicka mejl`.
  - Unsubscribed (just now, or already earlier): `Klart. Du får inga fler mejl om nya inlägg.` and the button `Ångra`, which clears `unsubscribed_at` and shows the subscribed state again.
  - Unknown, malformed or missing token: `Länken fungerar inte.` The same answer for every bad token.
- **`/unsubscribe/one-click?t=<token>`**: a route handler. `POST` unsubscribes (RFC 8058 one-click, used by mail apps) and answers `200`. `GET` redirects to `/unsubscribe?t=<token>`. Unknown tokens get the same answer as known ones, so the endpoint doesn't reveal which tokens exist.
- The token is the only authorization; the server actions on the page check it and nothing else.

## Settings

New, optional environment variables, validated in `src/env.ts` and documented in `.env.example` and the README:

- `SMTP_HOST`: empty turns emails off.
- `SMTP_PORT`: default `587`.
- `SMTP_SECURITY`: `starttls` (default; TLS required before credentials are sent), `tls` (TLS from the start, usually port 465), or `none` (local testing only). *(Claude's call: one setting instead of nodemailer's `secure` and `requireTLS` pair.)*
- `SMTP_USER`, `SMTP_PASSWORD`: both or neither.
- `SMTP_FROM`: required when `SMTP_HOST` is set, for example `prytz.nz <noreply@prytz.nz>`.

Links use `BETTER_AUTH_URL`, which is already the site's public URL.

**Local testing:** a Mailpit service in `docker-compose.dev.yml` (SMTP on 1025, inbox in the browser on 8025), with the matching settings in `.env.example` comments. *(Claude's call.)*

**README:** a short "Email" section with the settings, and a note that the sender domain needs SPF and DKIM set up as the SMTP provider describes (or emails land in spam). Add a first-deploy check: look for `[smtp] ok` in the application log. It doesn't suggest publishing a test post, because that would email everyone. The first real post is the end-to-end check, through Vilhelm's own copy.

## Constraints

- **Production data:** the migration runs on the live database. It must add the existing reactors and mark existing published posts as announced, in the same migration, so the first deploy sends nothing on its own.
- **Shutdown:** the guarantee that pending `after()` work finishes relies on the server getting SIGTERM and time to drain. The container runs `node server.js` (standalone output); Docker gives 10 seconds by default. Losing the tail of a send during a deploy is acceptable (it's logged). Checked while planning: the standalone server's `start-server.js` stops taking requests on SIGTERM and awaits pending `after()` work before exiting.
- **No new paid services.** SMTP is whatever server Vilhelm already has.

## Left to the builder

- How the email text and HTML are produced (a small template function is enough; no email framework).
- Where the claim lives (in `setPublished` or next to it), as long as it's one atomic statement and only the claimant sends.
- The test strategy. It should include:
  - the migration on a database at today's schema: existing reactors added with distinct tokens; published and once-published posts announced; drafts not
  - the list: reacting adds; removing a reaction keeps; unsubscribed stays unsubscribed after reacting again; undo resubscribes; unverified emails excluded
  - the claim: first publish claims once; a second publish, or publish after unpublish, doesn't
  - publishing adds the admin to the list, but doesn't resubscribe an admin who unsubscribed
  - the email: Swedish copy, escaping, missing place name, no name, headers (including `Reply-To`)
  - sending with a fake transport: one email per recipient, a failure doesn't stop the rest, SMTP off sends nothing
  - e2e: `/unsubscribe` works without the family password; unsubscribe and undo; a bad token
- Exact HTML layout and styling of the email and the unsubscribe page.
