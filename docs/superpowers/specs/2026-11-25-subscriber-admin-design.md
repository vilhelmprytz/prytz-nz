# Subscriber list in admin, and emails to the admin: design

Date: 2026-11-25
Status: reviewed by a builder (nothing open), awaiting Vilhelm's approval
Builds on: `docs/superpowers/specs/2026-11-23-new-post-emails-design.md` (new-post emails, the list, `/unsubscribe`, the test email button). That design listed "an admin screen for the list" and "emails for reactions" as non-goals; this adds them.

## Why

Vilhelm's older relatives have asked to be told about new posts, but signing in with Google and reacting (the only way onto the list today) is more than they can manage. Vilhelm has their consent and wants to put them on the list himself. With people added by hand, he also needs to see who is on the list, take people off, and hear when someone leaves.

Vilhelm also wants to hear when someone reacts to a post, as it happens.

## What success looks like

- On `/admin/subscribers` Vilhelm types a relative's email address (and name), taps Add, and that relative gets the next new-post email. No Google account, no sign-in, no welcome email.
- The same page shows everyone on the list and everyone who has left, and lets him take people off and put them back.
- When someone unsubscribes themselves, Vilhelm gets an email saying who.
- When someone reacts, Vilhelm gets an email saying who, with which emoji, on which post.

## Anti-goals

- Someone getting two copies of a new-post email (for example a relative Vilhelm added who later signs in with Google using the same address and reacts).
- Someone Vilhelm removed being put back on the list by reacting.
- Unsubscribe links in emails already sent stop working.
- The first deploy sending any email by itself, or changing who gets new-post emails.
- Reacting, publishing or unsubscribing failing or slowing down because sending an email to the admin failed.
- Email addresses in the server log.

## Non-goals

- A subscribe or unsubscribe button on the site for signed-in readers. The link in each email is the way to unsubscribe, as now.
- A welcome email when someone is added.
- Editing a subscriber's name or address after adding. (Remove, and add again under a new address if needed.)
- Deleting people from the list entirely.
- Grouping reaction emails, or a daily summary. One email per reaction.
- An email to the admin when someone presses "Ångra" (resubscribes), or when the admin removes or turns someone back on.
- Telling a relative they were added.

## Decided by Vilhelm

- **Adding:** by email address and name. The added person needs no account. Vilhelm has their consent.
- **Removing marks the person unsubscribed** (they stay in the list, shown as unsubscribed, and can be turned back on). Reacting doesn't put them back. Vilhelm accepts that the "Ångra" button behind an old email's unsubscribe link can turn them back on.
- **No welcome email.** An added person's first email is the next new-post email.
- **No new subscribe/unsubscribe button on the site.** The link in the email stays the only way for readers.
- **Unsubscribe email to the admin**, when someone unsubscribes.
- **Reaction email to the admin: one per reaction, right away** (approach A of three: per reaction, per visit, daily). Switching a reaction off and on again sends another.
- **Storage: approach A** (below), one list where each person is either a sign-in or a typed address.
- Vilhelm accepted the rest of Claude's proposals in the conversation; they're marked *(Claude's call, accepted)* below.

## Approaches considered (storage)

The list today (`post_email_subscribers`) is keyed by `user_id`: everyone on it is a Google sign-in. Typed addresses need somewhere to live.

- **A. One list; each row is a sign-in or a typed address (chosen).** The table gets its own id; `user_id` becomes optional; new columns hold the typed address and name, how the person joined, and who unsubscribed them. Sending, `/unsubscribe`, the one-click route and the admin page keep reading one table. Cost: a migration that reshapes a table that's in use in production (its primary key changes).
- **B. A separate table for typed addresses.** Safest migration (existing table untouched), but sending, `/unsubscribe`, one-click and the admin page each look in two places, and duplicates are matched by address at send time.
- **C. Create a `user` row for each relative.** Least code, but it puts people who never signed in into the auth tables and relies on Better Auth linking a later Google sign-in to that row, which is library behavior the app doesn't control.

Vilhelm picked A: one list, one source of truth; the migration runs once and is tested against today's schema.

## The list

### Data

`post_email_subscribers` changes to:

| Column | Meaning |
|---|---|
| `id` | New primary key (uuid). |
| `user_id` | The sign-in, if any. Now nullable; still unique, still references `user` with cascade on delete. |
| `email` | The address typed by the admin, stored trimmed and lowercased. Null for people who joined by reacting. Unique when not null. |
| `name` | The name typed by the admin, may be empty. Empty for people who joined by reacting. |
| `source` | How they joined: `reaction` (reacted, or the admin joining on publish) or `admin` (added on the admin page). |
| `unsubscribe_token` | Unchanged: same values, same default, still unique. |
| `subscribed_at` | Unchanged. |
| `unsubscribed_at` | Unchanged: null while subscribed. |
| `unsubscribed_by` | `self` or `admin` while unsubscribed; null while subscribed. |

Every row has a `user_id` or an `email` (or both, see "Linking" below); a check constraint enforces it.

**Migration:** existing rows get an id, `source = 'reaction'`, and `unsubscribed_by = 'self'` where `unsubscribed_at` is set (until now the only way to unsubscribe was yourself). Tokens and timestamps are kept as they are, so links in emails already sent keep working and nobody's subscription changes.

**Defaults that keep old code working:** `id` defaults to a random uuid, `source` to `reaction`, and `name` to `''`. No constraint ties `unsubscribed_by` to `unsubscribed_at`. That way an insert of only `user_id` still works: the old container does that during a deploy, and so does the setup in `e2e/unsubscribe.spec.ts`. An unsubscribe by the old code leaves `unsubscribed_by` null; the admin page shows such a row as `themselves`. *(Claude's call)*

### Who a row's email goes to

- **Address and name:** for a row with a `user_id`, the account's current email and name, as today, except that a name typed by the admin wins for the greeting. For a row without a `user_id`, the typed address and name. *(Claude's call: Vilhelm knows what his relatives like to be called.)*
- **Who gets new-post emails:** subscribed rows (`unsubscribed_at is null`), where either the row has no `user_id` (a typed address, vouched for by the admin), or its account's email is verified (as today; keeps e2e test accounts out).
- **Greeting:** as today. `Hej <first word of name>!`, or `Hej!` with no name.
- **Footer** depends on `source`:
  - `reaction`: unchanged, `Du får det här mejlet eftersom du har reagerat på ett inlägg på prytz.nz.`
  - `admin`: `Du får det här mejlet eftersom du har bett om att få mejl om nya inlägg på prytz.nz.` *(Claude's call, accepted)*
- Everything else about the new-post email (subject, link, unsubscribe link, one-click headers, Reply-To) is unchanged.

### Linking a typed address to a sign-in

So that nobody gets two copies:

- **Reacting** with an account whose verified email matches a typed-address row that has no `user_id` (compared lowercased) sets that row's `user_id` instead of adding a new row. The row keeps its `source`, name, token and subscribed/unsubscribed state. An unsubscribed row stays unsubscribed. *(Claude's call, accepted)*
- **Adding** an address on the admin page that matches a verified account's email:
  - if that account is already on the list: no new row; the page says so (see messages below);
  - if it isn't: the new row is created with that `user_id` (and the typed address and name), `source = 'admin'`.
- **The admin joining on publish** (`announceNewPost`) uses the same lookup, so an admin who added their own address by hand isn't added twice.
- Unverified accounts are never linked to a typed address.

## The admin page: `/admin/subscribers`

English, like the rest of the admin. Phone first. Linked from `/admin` (next to "View site"); it links back to Posts. Guarded like the other admin pages (`requireAdminPage`, server actions call `assertAdmin`).

```
Subscribers                                  ← Posts
12 get new-post emails

Name (optional)  [            ]
Email            [            ]   [ Add ]

Anna Prytz    anna@example.se    added by you   [Remove]
Erik          erik@gmail.com     reacted        [Remove]
Vilhelm       vilhelm@…          you            [Remove]

Unsubscribed
Karin         karin@example.se   themselves, 3 Nov   [Turn back on]
Olle          olle@example.se    removed by you      [Turn back on]
```

- **Count:** the number of rows that would get the next new-post email.
- **Subscribed** section: everyone subscribed, sorted by name (rows with no name sort by address). Each row shows name (or nothing), address, and how they joined: `you` (the row whose address matches `ADMIN_EMAIL`), `added by you` (`source = 'admin'`), or `reacted`.
- **Unsubscribed** section: everyone unsubscribed, most recent first, with `themselves, <date>` or `removed by you, <date>`. Hidden when empty.
- A subscribed row whose account isn't verified (only e2e test accounts) is shown with `gets no email (unverified)` and isn't counted. *(Claude's call)*
- **Add:** a form with an optional name and a required email.
  - Invalid address: `That isn't an email address.`
  - Already subscribed: `<address> is already on the list.`
  - On the list but unsubscribed: `<address> is on the list but unsubscribed. Use Turn back on below.` (Nothing changes; turning someone back on is its own button.)
  - Success: `Added <address>.`, the form clears, and the row appears.
- **Remove:** sets `unsubscribed_at = now`, `unsubscribed_by = 'admin'`. No confirmation, because it can be undone. No email to anyone.
- **Turn back on:** clears `unsubscribed_at` and `unsubscribed_by`, for anyone, including people who unsubscribed themselves (for example by mistake). No email to anyone. *(Claude's call, accepted)*
- Dates as `3 Nov 2026`. The exact format and time zone are the builder's choice.

## `/unsubscribe` and one-click

- Unchanged for the reader. The page's button sets `unsubscribed_by = 'self'`; "Ångra" clears both fields.
- Someone the admin removed who opens an old unsubscribe link sees the existing "Klart. Du får inga fler mejl om nya inlägg." state with "Ångra", which turns them back on. (Accepted by Vilhelm.)
- `setSubscribed` (or its replacement) reports whether the state actually changed, and who the row is, so the caller knows whether to email the admin.

## Email to the admin when someone unsubscribes

- **When:** someone's row goes from subscribed to unsubscribed through the `/unsubscribe` button or a one-click `POST`. Not when they were already unsubscribed (mail apps can send one-click twice), not when the admin removes them, not on "Ångra".
- **Not** sent when the person unsubscribing is the admin themself (the row whose address matches `ADMIN_EMAIL`). *(Claude's call)*
- **To** `ADMIN_EMAIL`, **from** `SMTP_FROM`, **Reply-To** the person's address, so Vilhelm can answer them directly. *(Claude's call)*
- **English**, plain text plus a simple HTML version, values escaped:

  ```
  Subject: Karin unsubscribed from new-post emails

  Karin (karin@example.se) unsubscribed from new-post emails.

  Subscribers: https://prytz.nz/admin/subscribers
  ```

  With no name: `karin@example.se unsubscribed from new-post emails.` in both subject and body.
- Sent after the response (`after()`), like new-post emails, so the reader's unsubscribe isn't slowed or broken by SMTP. The one-click route still answers `200` for every token, known or not.
- Sent to `ADMIN_EMAIL` regardless of whether the admin is on the list or unsubscribed.

## Email to the admin when someone reacts

- **When:** `toggleReaction` returns `added`. Not when a reaction is removed. Not for the admin's own reactions. One email per added reaction, right away; switching off and on again sends another.
- **To** `ADMIN_EMAIL`, **from** `SMTP_FROM`, **Reply-To** the reactor's address. *(Claude's call)*
- **English**, plain text plus a simple HTML version, values escaped:

  ```
  Subject: Erik reacted ❤️ to Milford Sound

  Erik (erik@gmail.com) reacted ❤️ to Milford Sound.

  See the post: https://prytz.nz/?post=<post id>
  ```

  The name is the account's name; with an empty name, the address is used in its place.
- Sent after the response (`after()`), so reacting stays instant. A failure is logged, not shown to the reader.
- Sent to `ADMIN_EMAIL` regardless of the admin's own subscription.

## Both admin emails

- Built on the existing `Mailer` (`createMailer`). One connection per email; closed afterwards.
- **SMTP off** (`SMTP_HOST` empty): nothing is sent; one log line says so.
- **Logging:** `[notify] reaction email sent` / `failed`, `[notify] unsubscribe email sent` / `failed`, with user or row ids, never addresses (the existing `redact` approach for SMTP error messages).
- No retries.

## Constraints

- **Production data:** the migration runs on the live database at container start, like the others. It must not change anyone's subscription or token.
- **No new dependencies or services.**
- **Shutdown:** relies on `after()` finishing on SIGTERM, as the new-post emails already do.

## Left to the builder

- Exact migration SQL (dropping and re-adding the primary key, the partial unique index on `email`, the check constraint), generated with drizzle-kit where it can and hand-edited where it can't, as with `0005`.
- How `listRecipients`, `addSubscriber`, `setSubscribed` change shape, and where the admin-list query lives.
- Email template functions for the two admin emails (no email framework).
- Styling of `/admin/subscribers`, within the existing `admin.module.css`.
- The test strategy. It should include:
  - the migration on a database at today's schema: rows kept with the same tokens and timestamps; `source` and `unsubscribed_by` filled in; the check constraint and uniqueness hold
  - linking: reacting with a matching verified address links instead of adding; unverified doesn't link; an unsubscribed typed row stays unsubscribed after linking; admin-on-publish links too
  - adding: each message (invalid, already subscribed, on the list but unsubscribed, success); matching an existing verified account
  - remove and turn back on, and that reacting doesn't resubscribe a removed person
  - recipients: typed addresses included; unverified accounts excluded; no duplicates after linking; the typed name wins for the greeting; the footer for each `source`
  - the unsubscribe email: sent once on a real change (page and one-click), not when already unsubscribed, not for admin removal, not for "Ångra", not for the admin's own unsubscribe; content, escaping, no-name form, Reply-To
  - the reaction email: sent on add, not on remove, not for the admin; content, escaping, empty-name form, Reply-To
  - SMTP off sends nothing for both
  - e2e: `/admin/subscribers` needs an admin session; add, remove, turn back on; the existing `/unsubscribe` specs still pass
- README: the Email section mentions the subscriber page and the two admin emails.
