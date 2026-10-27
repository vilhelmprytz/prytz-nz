# prytz.nz: travel photo journal, design

Date: 2026-10-27
Status: reviewed by a builder, awaiting Vilhelm's approval

## Why

Vilhelm is travelling for a few months: Stockholm → Los Angeles → New Zealand → Singapore → back to Stockholm. The trip is already underway. Family and friends want to follow along.

The site is a private, photo-first journal at **prytz.nz**. Each stop gets a post with photos and a short write-up. A map shows the route so far. Vilhelm posts from an Android phone while on the road, often on mobile data.

## What success looks like

- Vilhelm can turn a handful of phone photos into a published post in a few minutes, from the phone, on a flaky connection.
- A family member opens prytz.nz, types the family password once, and immediately sees the latest post. They can scroll back through older posts or follow the dots on the map.
- Family and friends can react to a post, and Vilhelm can see *who* reacted.
- Stops that happened before the site existed can be backfilled. Posts are ordered by when the photos were taken, not when they were published.

## Anti-goals (a failure even if it technically works)

- Readers have to sign in with Google, or create an account, just to look.
- Posting from the phone is fiddly enough that it stops happening.
- Photos can be reached without the family password, for example through a copied link.
- The route line goes the long way around the world, such as LA → NZ drawn across Europe and Asia.

## Non-goals for v1

- Comments
- Video
- Email or push notifications when a new post is published
- More than one author
- Swedish or multi-language UI (the UI is English)
- Search-engine visibility (the site is `noindex`)
- Keeping full-resolution originals (Google Photos already backs them up)
- Server-side image processing

## Who can do what

There are three levels of access.

1. **Visitor without the password.** Sees only the password page. Nothing else is reachable: no pages, API routes or photo URLs.
2. **Reader.** Has entered the family password. Sees all published posts. Can *optionally* sign in with any Google account to react. Signing in with Google never replaces the password; it only says who someone is.
3. **Admin.** Signed in with Google as the address in `ADMIN_EMAIL` (`vilhelm@prytznet.se`). Can create, edit and delete posts. An admin session also gets past the password gate. *(Claude's call.)*

### Family password gate

- The password is in the `FAMILY_PASSWORD` env var.
- A correct password sets a signed, HttpOnly cookie that lasts about 180 days *(Claude's call)*. The cookie's signature depends on the current password, so changing the password signs everyone out.
- **Rate limiting** is per client IP: after 5 failed attempts within 15 minutes, that IP is locked out for 15 minutes. These numbers are Claude's call. Attempts are recorded in Postgres, so a redeploy doesn't reset them.
- The app runs behind Dokploy's Traefik proxy. Take the client IP from the forwarding header Traefik sets, and make sure a client can't spoof it by sending its own header.
- The app must use the real visitor IP. If it sees every visitor as one IP (behind Docker networking, over IPv6, or with an extra proxy in front of Traefik), five wrong guesses by anyone would lock the whole family out. Make the number of trusted proxy hops configurable, log the IP the app sees, and check it at the first deploy. Rate-limit IPv6 by /64 prefix, not by single address.
- Every page sends `noindex`. A link preview of prytz.nz (in WhatsApp, for example) shows the site title and nothing else.

## Reader experience

An approved clickable prototype is at `docs/superpowers/specs/2026-10-27-travel-journal-prototype.html`. Open it in a browser. It contains code for three styles, but **only "Postcard" (the one shown) applies**. Its photos and text are placeholders.

### Layout (desktop)

- The **feed** fills the left two-thirds. The **map** fills the right third, at full height, and doesn't scroll with the feed.
- The map can be **hidden**. The feed then takes the full width (content is centred, max about 1000px), and a floating "Show map" button brings the map back. The browser remembers the choice in localStorage *(Claude's call)*.

### Layout (phone)

This is Claude's call; Vilhelm hasn't seen it on a phone. The map is a strip across the top, about 35% of the screen height, that can be hidden. The feed scrolls below it. Many readers will be on phones, so this needs to feel good there.

### Feed

- Shows published posts only, **newest first**, ordered by the post's taken-at date and time.
- Each post shows, in this order:
  1. A small uppercase meta line: date · place name.
  2. A large title.
  3. The headline photo, at 3:2.
  4. The description.
  5. A grid of up to 5 thumbnails of the other photos. The fifth shows "+N" when there are more.
  6. The reaction row.
- Clicking any photo opens a **full-screen viewer** for that post's photos. It has previous/next controls, keyboard arrows and Esc on desktop, and swipe on phones.
- Loading older posts (pagination or infinite scroll) is left to the builder. However many posts are loaded, the map shows **every** published post, and clicking a dot for a post that isn't loaded yet still has to take the reader to it.

### Visual style: "Postcard"

| Element | Value |
|---|---|
| Background | `#fbfaf7` |
| Text | `#14161c` |
| Muted | `#6f7380` |
| Lines | `#e6e4de` |
| Accent | `#2147d6` |
| Titles | Instrument Serif, italic, large (~60px on desktop) |
| Body text | DM Sans |
| Site title | "Vilhelm's trip" |
| Subtitle | "Around the globe · 2026" |

### Map

- Built with **Leaflet**, using **satellite** imagery: Esri World Imagery in the prototype.
  - Include the required attribution.
  - If Esri's terms require an API key, or don't allow this use, switch to an equivalent satellite tile provider with a free tier.
- There is one dot per published post, at the post's location. A **solid white line** joins the dots in date order, oldest to newest.
- Dot styling: white with an accent-coloured ring. The **active** dot is filled with the accent colour and shows a tooltip with the title and date.
- Feed and map are linked:
  - Scrolling the feed makes the post in view the active dot. If that dot is off-screen, the map pans to it.
  - Clicking a dot scrolls the feed to that post.
  - A "Whole trip" button zooms the map to fit every dot.
- **Crossing the date line:** "unwrap" the longitudes. Walking the posts in date order, add or subtract 360° from each longitude whenever that makes the jump from the previous point shorter. Place the markers on the same unwrapped coordinates. This makes LA → NZ cross the Pacific, and makes "Whole trip" fit the way you'd expect.

### Reactions

- There are five emoji: ❤️ 👍 😂 😮 🙌.
- They work like Slack: each person can switch each emoji on or off for each post *(Claude's call)*.
- Under each post, show each emoji that has been used, with a count and names, e.g. "❤️ Mum, Erik and 3 others". Hovering or tapping shows the full list. Names come from the reader's Google profile.
- A reader who isn't signed in and taps an emoji goes through Google sign-in. Any Google account is accepted. They come back to the same post, and their reaction is applied.

## Posting (admin, phone-first)

Vilhelm posts from Chrome on an Android phone. The admin UI must be designed for a phone first.

1. **Sign in.** Go to `/admin` and sign in with Google. Only `ADMIN_EMAIL` gets in.
2. **New post.** Pick several photos at once from the phone's gallery.
3. **Processing in the browser, for each photo:**
   - **Before resizing**, read the EXIF data: date/time taken (including the UTC offset when there is one) and GPS. Resizing on a canvas strips EXIF, so this has to happen first.
   - Make two sizes: **display** (long edge about 2560px) and **thumb** (long edge about 640px). Encode as WebP or JPEG at about 0.8 quality *(Claude's call)*.
   - If a photo can't be decoded (for example HEIC on a browser that doesn't support it), show a clear error for that photo. Converting HEIC is not in scope.
4. **Upload** both sizes straight from the phone to R2, using presigned PUT URLs issued by the app. The bucket's CORS settings must allow uploads from prytz.nz.
   - Show progress for each photo.
   - Retry failed uploads, and survive a dropped connection without losing the rest of the post.
5. **Compose the post:**
   - Choose the **headline** photo. It defaults to the first one.
   - Enter the **title** and **description**. The description is plain text; line breaks are kept and there is no markdown *(Claude's call)*.
   - Reordering photos is nice to have and left to the builder.
6. **Date** is filled from the earliest photo's taken-at time and can be edited.
7. **Location** is filled from the first of these that's available:
   1. the headline photo's GPS
   2. the GPS of any other photo in the post
   3. the phone's current location, through a "Use my current location" button
   4. a pin dropped on a small map

   The location can always be adjusted on that map.
8. **Place name** is filled in automatically by reverse geocoding the location, then shortened to something like "Queenstown, New Zealand". It can be edited. Use OpenStreetMap Nominatim, within its usage policy *(Claude's call)*.
9. **Save as draft** or **Publish**. Drafts are never visible to readers.
10. **Later edits.** An existing post can have its text, date, location or place name changed. Photos can be added or removed, the headline changed, and the post unpublished or deleted. Deleting also removes its photos from R2 *(Claude's call)*.

**Times:** EXIF times are usually local time with no time zone. Store the taken-at time together with its UTC offset when the photo has one. Show readers the **local date at the place**. Use the full time for ordering posts within a day.

**Verify early:** in the first working milestone, check on Vilhelm's Android phone whether GPS data survives Chrome's photo picker. Newer Android versions can strip it. The location fallbacks above exist for this reason, but if GPS never comes through, posting with "current location" or a pin has to be quick.

## Photo storage and serving (decided by Vilhelm)

- Photos are stored in a **private Cloudflare R2 bucket**: no public access and no `r2.dev` URL. Object keys are random IDs, for example `photos/{uuid}/display.webp` and `photos/{uuid}/thumb.webp`.
- prytz.nz's DNS is self-hosted, not on Cloudflare, so **every photo is served through the app** at `prytz.nz/photos/...`. The app checks the password cookie or admin session, then streams the file from R2.
- Object keys never change, so photo responses send `Cache-Control: private, max-age=31536000, immutable`.
- Readers can only load photos that belong to **published** posts. Draft photos are admin-only, even if someone has the URL.
- When an upload finishes, the server checks that each object exists, is within a size limit and has an image content type, and only then attaches it to the post.

## Data (a sketch; the builder may refine it)

- **posts:** id, title, description, place_name, lat, lng, taken_at (with offset), status (draft or published), headline_photo_id, created_at, updated_at, published_at
- **photos:** id, post_id, display_key, thumb_key, width, height, sort_order, taken_at, lat, lng (the last three from EXIF, nullable)
- **users** (Google sign-ins): id, google_sub, name, email, avatar_url
- **reactions:** post_id, user_id, emoji, created_at; unique on (post_id, user_id, emoji)
- **login_attempts:** ip, attempted_at, success

Map dots use each post's lat/lng. Route order is published posts sorted by taken_at, oldest first.

## Tech and deployment

- **Next.js** (App Router, TypeScript) with `output: 'standalone'`, which the Dockerfile requires. The Dockerfile also copies `public/`, so that folder must exist.
- The **Dockerfile** is Vilhelm's. Keep it, and change it only where needed, for example to copy a migrations folder into the image *(Claude's call)*.
- **PostgreSQL** runs as a database service on Dokploy, accessed through **Drizzle ORM** *(Claude's call)*. Migrations run automatically when the container starts. The standalone image won't contain dev tools, so run them with the runtime migrator, not a CLI.
- **Auth.js** (NextAuth v5) with the Google provider, using one OAuth client for both admin and readers. A user counts as admin when their verified email equals `ADMIN_EMAIL`.
- **Leaflet** for the map. **exifr** (or similar) for reading EXIF in the browser. Canvas or OffscreenCanvas for resizing. The AWS S3 SDK for R2 (presigning and reading).
- **Hosting:** Dokploy builds the image from the Dockerfile and its Traefik proxy handles TLS. Vilhelm points prytz.nz at the Dokploy host through the self-hosted DNS.
- **Env vars:** `DATABASE_URL`, `FAMILY_PASSWORD`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAIL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, plus whatever Auth.js needs for the public URL (`https://prytz.nz`).
- A **README** covers setup:
  - creating the Google OAuth client and its redirect URIs
  - creating the R2 bucket, its API token and its CORS rule
  - creating the Dokploy app and database, and setting the env vars
  - running locally

## Decided by Vilhelm

- Built with Next.js, deployed on Dokploy with the provided Dockerfile, using PostgreSQL.
- The main page has the feed on the left and the map on the right, photos get two-thirds of the width, and the map can be hidden.
- A post has a title, one headline photo, a description and optional extra photos.
- Locations come from the photos where possible, and the dots are joined in date order on an interactive Leaflet map.
- The visual style is "Postcard", with the satellite map.
- The subtitle is "Around the globe". The route is Stockholm → LA → NZ → Singapore → Stockholm.
- The admin signs in with Google, limited to vilhelm@prytznet.se. Posting is done from an Android phone.
- Readers get in with one shared password from an env var, rate-limited per IP.
- Reactions are optional and need a Google sign-in, using ❤️ 👍 😂 😮 🙌. Readers never have to sign in just to look.
- Photos are stored in Cloudflare R2 and served through the app on prytz.nz (the DNS isn't on Cloudflare).
- The trip is already underway, but per Vilhelm that shouldn't change how it's built: build the full v1 described here, not a cut-down version.

## Claude's calls (Vilhelm can override these)

- The phone layout (map strip on top).
- The password cookie lasts about 180 days and is invalidated when the password changes. The rate limit is 5 tries per 15 minutes, stored in Postgres.
- An admin session gets past the password gate.
- Reactions work like Slack, with each emoji toggled separately, and show names.
- Photos are resized on the phone (about 2560px display, about 640px thumb). Originals are not kept.
- Place names come from Nominatim and can be edited.
- Descriptions are plain text.
- Deleting a post deletes its photos.
- Drizzle is the ORM, and migrations run at startup.
- The UI is in English.
- The map remembers whether it was hidden, in localStorage.

## Left to the builder

- **Build order:** get posting working first, so Vilhelm can start backfilling privately before anyone has the link. Suggested order: (1) the password gate, admin sign-in, the phone posting flow and the basic feed; (2) the map with the route line, linked to the feed; (3) the full-screen viewer and reactions. All three are in v1.
- Each post has its own link (for example `/p/{id}`, or a `#post-id` anchor) that scrolls to the post and highlights it on the map.
- An unfinished post in the editor survives a page reload, as a server draft or local storage.
- Cleaning up uploads that never got attached to a post.
- Database backups: Dokploy can back Postgres up to S3-compatible storage, so the R2 account works for this.
- Ordering photos whose time has no UTC offset: treat the time as local at the photo's location.

- Pagination or infinite scroll.
- Component and module structure.
- Exact rate-limit and cookie mechanics, within the rules above.
- Upload retry strategy.
- Photo reordering in the editor.
- Test strategy.
- Admin UI layout details, beyond "phone-first and quick".
