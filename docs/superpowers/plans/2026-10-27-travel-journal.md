# prytz.nz Travel Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, password-gated, photo-first travel journal at prytz.nz. The admin posts from an Android phone. Readers browse a feed linked to a satellite route map, and can react to posts.

**Architecture:** A single Next.js 16 App Router app, run as one standalone container on Dokploy, with PostgreSQL through Drizzle.
- A `proxy.ts` gate handles the family-password cookie. Better Auth handles Google sign-in for both admin and readers.
- Photos are resized in the browser and uploaded with presigned PUTs to a private R2 bucket. They are always served back through the app at `/photos/...`.
- The feed and the Leaflet map are client components that share an "active post" state.

**Tech Stack:** Next.js 16.4.3, React 19.3, TypeScript, Drizzle ORM 0.45.4 + postgres-js 3.4.9, Better Auth 1.7.14 (Google), Leaflet 1.9.4, exifr 7.1.3, AWS SDK v3 (S3 client for R2), zod 4, Vitest 5 + PGlite (unit and DB tests), Playwright 1.64 (e2e).

**Spec:** `docs/superpowers/specs/2026-10-27-travel-journal-design.md`. The approved visual reference is `docs/superpowers/specs/2026-10-27-travel-journal-prototype.html`; only the Postcard theme applies.

## Global Constraints

- Next.js `16.4.3` with `output: 'standalone'`. Node 22 (Dockerfile base `node:22-alpine`). Middleware is `src/proxy.ts`, exporting `proxy`.
- Pinned runtime deps: `drizzle-orm@0.45.4`, `postgres@3.4.9`, `better-auth@1.7.14`, `leaflet@1.9.4`, `exifr@7.1.3`, `@aws-sdk/client-s3@3.1158.0`, `@aws-sdk/s3-request-presigner@3.1158.0`, `zod@4.6.7`.
- Pinned dev deps: `drizzle-kit@0.31.11`, `@types/leaflet@1.9.22`, `vitest@5.0.5`, `@electric-sql/pglite@0.5.12`, `@playwright/test@1.64.1`, `piexifjs` (latest).
- UI copy is English. The site title is exactly `Vilhelm's trip` and the subtitle is exactly `Around the globe · 2026`.
- Postcard tokens: bg `#fbfaf7`, ink `#14161c`, muted `#6f7380`, line `#e6e4de`, accent `#2147d6`. Titles use Instrument Serif italic (~60px desktop); body text uses DM Sans. Both fonts load through `next/font/google`.
- Reactions are exactly `['❤️', '👍', '😂', '😮', '🙌']`, in that order.
- Family cookie: `pz_gate`, HttpOnly, SameSite=Lax, Secure in production, 180-day lifetime. It is invalid once `FAMILY_PASSWORD` changes.
- Rate limit: 5 failed attempts within 15 minutes locks that IP key for 15 minutes from the 5th failure. IPv6 is keyed by its /64 prefix. The client IP comes from `X-Forwarded-For`, using `TRUSTED_PROXY_HOPS` (default 1).
- Admin: the verified Google email equals `ADMIN_EMAIL`, compared case-insensitively. An admin session also passes the family gate.
- Photos:
  - Sizes: display long edge 2560px, thumb long edge 640px, encoder quality 0.8. Encode WebP, falling back to JPEG.
  - Upload limits: display ≤ 15 MB, thumb ≤ 2 MB. Allowed types: `image/webp`, `image/jpeg`.
  - Photo responses send `Cache-Control: private, max-age=31536000, immutable`.
- Readers can never load photos of unpublished posts.
- Every response carries `X-Robots-Tag: noindex, nofollow`. `robots.txt` disallows everything. Metadata has no images.
- No server-side image processing (no `sharp`). Originals are not stored.
- The Dockerfile is Vilhelm's. The only allowed change is copying `drizzle/` into the runner stage.
- Nominatim calls send `User-Agent: prytz.nz travel journal (https://prytz.nz)`, at most 1 request per second, and are made only from the admin geocode route.

## Review Focus

1. **Every visitor resolves to the same IP behind Traefik.** If that happens, one person's wrong guesses lock out the whole family. Expected: each visitor's real IP is used and spoofed left-most `X-Forwarded-For` entries are ignored. Tests in Task 3; the log check is in Task 11.
2. **Photos with no EXIF date or GPS** (screenshots, images forwarded through WhatsApp, location stripped by the picker). Expected: the post stays publishable; the editor asks for "current location" or a pin and pre-fills nothing wrong. Tests in Tasks 8 and 10.
3. **The connection drops mid-upload on mobile data.** Expected: finished photos stay attached, the failed one shows "Retry", and nothing else is lost. Tests in Tasks 8 and 10.
4. **Portrait photos taken sideways (EXIF orientation).** Expected: they display upright, with the post-rotation width and height stored. Test in Task 10 (e2e with a rotated fixture).
5. **No published posts yet, or exactly one post.** Expected: the feed shows an empty state, and the map renders with no route line and no crash. Tests in Tasks 12 and 13.

---

## File Structure

```
Dockerfile                          (Vilhelm's; Task 11 adds one COPY line)
next.config.ts                      standalone output, X-Robots-Tag header
drizzle.config.ts / drizzle/        drizzle-kit config + generated SQL migrations
docker-compose.dev.yml              Postgres 17 for dev + e2e (dbs: prytz, prytz_e2e)
docker/initdb/01-e2e.sql            creates prytz_e2e
.env.example
vitest.config.ts / playwright.config.ts
e2e/                                global-setup.ts, seed.ts, fixtures.ts, *.spec.ts
src/env.ts                          zod-validated server env (lazy)
src/instrumentation.ts              runs migrations + stale-upload cleanup at startup
src/proxy.ts                        family gate
src/db/schema.ts                    app tables; re-exports auth tables
src/db/auth-schema.ts               Better Auth tables (generated)
src/db/client.ts                    getDb(), Db type
src/db/migrate.ts                   runMigrations()
src/db/test-db.ts                   createTestDb() on PGlite (tests only)
src/gate/token.ts                   gate cookie token
src/gate/client-ip.ts               clientIp(), rateLimitKey()
src/gate/rate-limit.ts              isLockedOut(), recordAttempt()
src/gate/paths.ts                   classifyPath(), safeNextPath()
src/gate/access.ts                  readerAccess(), assertReader()
src/auth/auth.ts / auth-client.ts   Better Auth server + React client
src/auth/viewer.ts                  isAdminUser(), getViewer(), requireAdminPage(), assertAdmin()
src/storage/storage.ts              Storage interface + getStorage()
src/storage/s3.ts / fs.ts           R2 (S3 API) and local-filesystem drivers
src/photos/serve.ts                 servePhoto()
src/posts/types.ts                  shared post/photo/feed types
src/posts/repo.ts                   all post/photo queries
src/posts/actions.ts                admin server actions
src/posts/format.ts                 formatPostDate()
src/client/exif.ts                  summarizeExif(), readPhotoMeta()
src/client/post-defaults.ts         pickPostDefaults()
src/client/resize.ts                resizeImage()
src/client/upload.ts                uploadWithRetry(), uploadPhoto()
src/geo/unwrap.ts                   unwrapLongitudes()
src/geo/place-name.ts               formatPlaceName()
src/reactions/emoji.ts / repo.ts / summary.ts / actions.ts
src/app/layout.tsx, globals.css, robots.ts
src/app/unlock/page.tsx + actions.ts
src/app/page.tsx                    feed page
src/app/api/feed/route.ts
src/app/api/auth/[...all]/route.ts
src/app/api/admin/uploads/route.ts, uploads/[photoId]/complete/route.ts, geocode/route.ts
src/app/api/dev-storage/[...key]/route.ts
src/app/photos/[photoId]/[size]/route.ts
src/app/admin/login/page.tsx
src/app/admin/(protected)/layout.tsx, page.tsx, posts/[id]/page.tsx
src/components/feed/  TripLayout.tsx, Feed.tsx, PostCard.tsx, Lightbox.tsx, ReactionRow.tsx
src/components/map/   TripMap.tsx
src/components/admin/ PostEditor.tsx, PhotoTray.tsx, LocationPicker.tsx
README.md
```

---

### Task 1: Project scaffold

**Files:**
- Create: everything produced by `create-next-app`, then modify `next.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`
- Create: `src/env.ts`, `src/env.test.ts`, `vitest.config.ts`, `.env.example`, `docker-compose.dev.yml`, `docker/initdb/01-e2e.sql`, `src/app/robots.ts`, `public/.gitkeep`
- Commit as-is: `Dockerfile`

**Interfaces:**
- Produces: `getEnv(): Env` from `src/env.ts`. It parses `process.env` on first call and caches the result. `Env` has these fields:
  - `DATABASE_URL`, `FAMILY_PASSWORD`, `BETTER_AUTH_SECRET` (min 32 chars), `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL`
  - `STORAGE_DRIVER: 's3' | 'fs'` (default `'s3'`)
  - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, all required when the driver is `s3`
  - `FS_STORAGE_DIR` (default `'.storage'`)
  - `TRUSTED_PROXY_HOPS: number` (default 1)
  - `NOMINATIM_URL` (default `'https://nominatim.openstreetmap.org'`; an empty string disables geocoding)
  - `E2E_TEST_AUTH: boolean` (default false)

- [ ] **Step 1: Scaffold the app in the repo root**

Run: `npx create-next-app@16.4.3 . --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm --yes`. Keep the existing `Dockerfile`, `.gitignore` entries and `docs/`. Merge the generated `.gitignore` with the existing `.superpowers/` line, and add `.storage/`, `.env*.local`, `.env` and `/test-results`, `/playwright-report`.

- [ ] **Step 2: Configure `next.config.ts`**

Set `output: 'standalone'`, `poweredByHeader: false`, and `headers()` returning `X-Robots-Tag: noindex, nofollow` for source `/:path*`. Add `public/.gitkeep`; the Dockerfile copies `public/`.

- [ ] **Step 3: Install pinned deps and add Vitest**

Install the runtime and dev deps listed in Global Constraints. In `vitest.config.ts`: environment `node`, include `src/**/*.test.ts`, alias `@` to `./src`. Add scripts: `"test": "vitest run"`, `"test:e2e": "playwright test"`, `"db:generate": "drizzle-kit generate"`.

- [ ] **Step 4: Write the failing env test**

```ts
// src/env.test.ts
const base = { DATABASE_URL: 'postgres://x', FAMILY_PASSWORD: 'pw', BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', ADMIN_EMAIL: 'a@b.se' };
test('fs driver needs no S3 vars and applies defaults', () => {
  const env = parseEnv({ ...base, STORAGE_DRIVER: 'fs' });
  expect(env.TRUSTED_PROXY_HOPS).toBe(1);
  expect(env.FS_STORAGE_DIR).toBe('.storage');
  expect(env.E2E_TEST_AUTH).toBe(false);
});
test('s3 driver without S3 vars throws naming the missing var', () => {
  expect(() => parseEnv({ ...base })).toThrow(/S3_BUCKET/);
});
test('short auth secret is rejected', () => {
  expect(() => parseEnv({ ...base, STORAGE_DRIVER: 'fs', BETTER_AUTH_SECRET: 'short' })).toThrow();
});
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `npx vitest run src/env.test.ts`. Expected: FAIL, because `parseEnv` is not exported.

- [ ] **Step 6: Implement `parseEnv(raw: Record<string, string | undefined>): Env` and `getEnv(): Env` in `src/env.ts`**

Use a zod object, plus a `superRefine` for the S3 vars when `STORAGE_DRIVER === 's3'`. `getEnv` calls `parseEnv(process.env)` lazily, so `next build` never needs runtime secrets. Mark the file `import 'server-only'`.

- [ ] **Step 7: Run it and confirm it passes**

Run: `npx vitest run src/env.test.ts`. Expected: PASS (3 tests).

- [ ] **Step 8: Postcard shell**

`src/app/layout.tsx` loads Instrument Serif (400, italic) and DM Sans (400, 500, 700) with `next/font/google` and exposes them as CSS variables. Its `metadata` is `{ title: "Vilhelm's trip", robots: { index: false, follow: false } }`.

`globals.css` defines the Postcard tokens from Global Constraints as `--bg`, `--ink`, `--muted`, `--line`, `--accent`.

`src/app/robots.ts` returns `{ rules: { userAgent: '*', disallow: '/' } }`.

- [ ] **Step 9: Dev services and env example**

In `docker-compose.dev.yml`: service `db`, image `postgres:17-alpine`, port `5433:5432`, `POSTGRES_PASSWORD=dev`, `POSTGRES_DB=prytz`, mounting `./docker/initdb` to `/docker-entrypoint-initdb.d`. The init SQL is `CREATE DATABASE prytz_e2e;`.

`.env.example` lists every `Env` var, with comments that give the R2 endpoint form `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

- [ ] **Step 10: Verify the standalone build**

Run: `npm run build && ls .next/standalone/server.js`. Expected: the build succeeds and the file exists.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js 16 app with standalone output, env parsing, Postcard shell"
```

---

### Task 2: Database schema and migrations

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `src/db/test-db.ts`, `src/db/schema.test.ts`, `drizzle.config.ts`, `src/instrumentation.ts`, `drizzle/*` (generated)

**Interfaces:**
- Produces, in `src/db/schema.ts`:
  - `posts`:
    - `id` uuid pk, `defaultRandom()`
    - `title`, `description`, `placeName`: text, not null, default `''`
    - `lat`, `lng`: doublePrecision, nullable
    - `takenAtLocal`: `timestamp('taken_at_local', { mode: 'string' })`, nullable. This is the wall clock at the place; posts sort by it.
    - `utcOffset`: text, nullable, e.g. `+13:00`
    - `status`: text enum `'draft' | 'published'`, default `'draft'`
    - `headlinePhotoId`: uuid, nullable
    - `createdAt`, `updatedAt`, `publishedAt` (nullable): timestamptz
  - `photos`:
    - `id` uuid pk
    - `postId`: uuid, references `posts.id`, on delete cascade, not null
    - `displayKey`, `thumbKey`, `contentType`: text
    - `width`, `height`, `sortOrder`: integer
    - `takenAtLocal`, `utcOffset`, `lat`, `lng`: nullable, as in `posts`
    - `status`: text `'pending' | 'ready'`, default `'pending'`
    - `createdAt`: timestamptz
  - `loginAttempts`: `id` bigserial, `ipKey` text, `success` boolean, `attemptedAt` timestamptz default now. Index on `(ipKey, attemptedAt)`.
- Produces, elsewhere:
  - `type Db = PgDatabase<any, typeof schema>` (src/db/client.ts)
  - `getDb(): Db`, a singleton built with postgres-js from `getEnv().DATABASE_URL`
  - `runMigrations(): Promise<void>` (src/db/migrate.ts), which uses the `drizzle-orm/postgres-js/migrator` with `migrationsFolder: path.join(process.cwd(), 'drizzle')`
  - `createTestDb(): Promise<Db>` (src/db/test-db.ts), a fresh in-memory PGlite with all migrations applied through `drizzle-orm/pglite/migrator`

- [ ] **Step 1: Write the failing schema test**

```ts
// src/db/schema.test.ts
test('migrations create tables; deleting a post cascades to its photos', async () => {
  const db = await createTestDb();
  const [p] = await db.insert(posts).values({}).returning();
  expect(p.status).toBe('draft');
  await db.insert(photos).values({ postId: p.id, displayKey: 'd', thumbKey: 't', contentType: 'image/webp', width: 1, height: 1, sortOrder: 0 });
  await db.delete(posts).where(eq(posts.id, p.id));
  expect(await db.select().from(photos)).toHaveLength(0);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/db/schema.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Write the schema, `drizzle.config.ts` (dialect `postgresql`, out `./drizzle`), client, migrate and test-db; then run `npm run db:generate`**

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/db/schema.test.ts`. Expected: PASS.

- [ ] **Step 5: Run migrations at startup**

In `src/instrumentation.ts`, `register()` does nothing unless `process.env.NEXT_RUNTIME === 'nodejs'`; otherwise it dynamically imports and awaits `runMigrations()`.

Verify: `docker compose -f docker-compose.dev.yml up -d db`, then put `DATABASE_URL=postgres://postgres:dev@localhost:5433/prytz` in `.env.local` with `STORAGE_DRIVER=fs` and dummy auth vars. Run `npm run dev`, load `/`, then `psql postgres://postgres:dev@localhost:5433/prytz -c '\dt'`. Expected: `posts`, `photos` and `login_attempts` exist.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: drizzle schema for posts/photos/login attempts with startup migrations"
```

---

### Task 3: Gate primitives

**Files:**
- Create: `src/gate/token.ts`, `src/gate/client-ip.ts`, `src/gate/rate-limit.ts`, `src/gate/paths.ts`, each with a `*.test.ts` next to it

**Interfaces:**
- Produces:
  - `GATE_COOKIE = 'pz_gate'`
  - `GATE_MAX_AGE_S = 180 * 24 * 3600`
  - `createGateToken(nowMs: number, password: string, secret: string): string`. Format: `v1.<issuedAtMs>.<base64url HMAC-SHA256(secret, "gate:" + issuedAtMs + ":" + sha256hex(password))>`
  - `verifyGateToken(token: string | undefined, nowMs: number, password: string, secret: string): boolean`. Uses `timingSafeEqual`. Rejects a token issued more than 60s in the future or older than 180 days.
  - `clientIp(headers: Headers, trustedHops: number): string`
  - `rateLimitKey(ip: string): string`
  - `RATE_LIMIT = { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 }`
  - `isLockedOut(db: Db, ipKey: string, now: Date): Promise<boolean>`
  - `recordAttempt(db: Db, ipKey: string, success: boolean, now: Date): Promise<void>`
  - `type RouteClass = 'public' | 'self-guarded' | 'reader'`
  - `classifyPath(pathname: string): RouteClass`
  - `safeNextPath(next: string | null | undefined): string`

- [ ] **Step 1: Write the failing tests**

```ts
// token.test.ts
const T0 = Date.UTC(2026, 9, 27);
test('round trip', () => expect(verifyGateToken(createGateToken(T0, 'pw', S), T0 + 1000, 'pw', S)).toBe(true));
test('password change invalidates', () => expect(verifyGateToken(createGateToken(T0, 'pw', S), T0, 'new', S)).toBe(false));
test('expires after 180 days', () => expect(verifyGateToken(createGateToken(T0, 'pw', S), T0 + 181 * 864e5, 'pw', S)).toBe(false));
test.each(['', 'v1', 'v1.abc.def', 'v2.1.x', createGateToken(T0, 'pw', S) + 'x'])('rejects %s', t =>
  expect(verifyGateToken(t, T0, 'pw', S)).toBe(false));
test('rejects issuedAt far in the future', () => expect(verifyGateToken(createGateToken(T0 + 120_000, 'pw', S), T0, 'pw', S)).toBe(false));

// client-ip.test.ts
const h = (xff?: string) => new Headers(xff ? { 'x-forwarded-for': xff } : {});
test('takes the entry added by the outermost trusted proxy', () => {
  expect(clientIp(h('6.6.6.6, 198.51.100.1, 203.0.113.9'), 1)).toBe('203.0.113.9');
  expect(clientIp(h('6.6.6.6, 198.51.100.1, 203.0.113.9'), 2)).toBe('198.51.100.1');
});
test('fewer entries than hops → left-most', () => expect(clientIp(h('203.0.113.9'), 3)).toBe('203.0.113.9'));
test('no header → "unknown"', () => expect(clientIp(h(), 1)).toBe('unknown'));
test('unwraps IPv4-mapped IPv6', () => expect(clientIp(h('::ffff:203.0.113.9'), 1)).toBe('203.0.113.9'));
test('IPv6 keyed by /64', () => {
  expect(rateLimitKey('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
  expect(rateLimitKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
  expect(rateLimitKey('203.0.113.9')).toBe('203.0.113.9');
});

// rate-limit.test.ts  (each test uses createTestDb(); `at(min)` = new Date(T0 + min * 60_000))
test('locks on the 5th failure for 15 minutes from that failure', async () => {
  for (const m of [0, 1, 2, 3]) await recordAttempt(db, 'a', false, at(m));
  expect(await isLockedOut(db, 'a', at(4))).toBe(false);
  await recordAttempt(db, 'a', false, at(4));
  expect(await isLockedOut(db, 'a', at(18.9))).toBe(true);
  expect(await isLockedOut(db, 'a', at(19.1))).toBe(false);
});
test('spread-out failures: lock runs 15 min from the failure that completed 5-in-15', async () => {
  for (const m of [0, 1, 2, 3, 14]) await recordAttempt(db, 'a', false, at(m));
  expect(await isLockedOut(db, 'a', at(28.9))).toBe(true);
  expect(await isLockedOut(db, 'a', at(29.1))).toBe(false);
});
test('a success clears earlier failures', async () => {
  for (const m of [0, 1, 2, 3]) await recordAttempt(db, 'a', false, at(m));
  await recordAttempt(db, 'a', true, at(4));
  await recordAttempt(db, 'a', false, at(5));
  expect(await isLockedOut(db, 'a', at(6))).toBe(false);
});
test('other keys unaffected', async () => {
  for (const m of [0, 1, 2, 3, 4]) await recordAttempt(db, 'a', false, at(m));
  expect(await isLockedOut(db, 'b', at(5))).toBe(false);
});

// paths.test.ts
test.each([
  ['/unlock', 'public'], ['/api/auth/callback/google', 'public'], ['/robots.txt', 'public'],
  ['/admin', 'self-guarded'], ['/admin/posts/1', 'self-guarded'], ['/api/admin/uploads', 'self-guarded'],
  ['/api/dev-storage/photos/x', 'self-guarded'],
  ['/', 'reader'], ['/photos/x/display', 'reader'], ['/api/feed', 'reader'], ['/administrator', 'reader'], ['/unlockx', 'reader'],
])('%s → %s', (p, c) => expect(classifyPath(p)).toBe(c));
test.each([[null, '/'], ['/?post=1', '/?post=1'], ['//evil.com', '/'], ['https://evil.com', '/'], ['/\\evil.com', '/']])(
  'safeNextPath(%s) → %s', (n, out) => expect(safeNextPath(n)).toBe(out));
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/gate`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the four modules with the signatures above**

`isLockedOut` loads the failures for `ipKey` since the later of the last success and `now - 30min`, sorted ascending. Then it applies this rule:

```ts
let lockedUntil = 0;
for (let i = 4; i < f.length; i++)
  if (f[i] - f[i - 4] <= RATE_LIMIT.windowMs) lockedUntil = Math.max(lockedUntil, f[i] + RATE_LIMIT.lockMs);
return now.getTime() < lockedUntil;
```

`recordAttempt` also deletes rows older than 24h. `rateLimitKey` expands `::` before taking the first 4 hextets, writing each without leading zeros.

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run src/gate`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gate && git commit -m "feat: gate token, client IP resolution, rate limiting and path classes"
```

---

### Task 4: Unlock page, proxy and e2e harness

**Files:**
- Create: `src/proxy.ts`, `src/gate/access.ts`, `src/app/unlock/page.tsx`, `src/app/unlock/actions.ts`, `src/app/page.tsx` (placeholder: site title + "No posts yet"), `src/app/api/feed/route.ts` (placeholder 200 `[]`)
- Create: `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/gate.spec.ts`

**Interfaces:**
- Consumes: Task 3's gate functions, `getEnv()`, `getDb()`.
- Produces:
  - `readerAccess(): Promise<{ hasGate: boolean; isAdmin: boolean }>`, which reads `cookies()` and `headers()`. In this task `isAdmin` is always `false`; Task 5 fills it in.
  - `assertReader(): Promise<void>`, which throws `Error('Forbidden')` when neither is true.
  - `unlock(prevState: { error?: string }, formData: FormData): Promise<{ error?: string }>`, a server action. Exact copy for its two errors:
    - wrong password: `That's not the password.`
    - locked out: `Too many tries. Try again in 15 minutes.`
- e2e conventions used by later tasks:
  - `baseURL` is `http://localhost:3100`.
  - The `webServer` runs `npx next dev --port 3100` with env `DATABASE_URL=postgres://postgres:dev@localhost:5433/prytz_e2e`, `STORAGE_DRIVER=fs`, `FS_STORAGE_DIR=.storage-e2e`, `FAMILY_PASSWORD=e2e-password`, `ADMIN_EMAIL=admin@e2e.test`, `E2E_TEST_AUTH=1`, `NOMINATIM_URL=` (empty), `TRUSTED_PROXY_HOPS=1`, plus dummy Google vars.
  - `global-setup.ts` drops and recreates `public` in `prytz_e2e`, runs migrations, clears `.storage-e2e`, and calls `seed()` from `e2e/seed.ts` (a no-op until Task 12).
  - Each spec sets its own `x-forwarded-for` through `test.use({ extraHTTPHeaders })`, so rate limits never collide between tests.

- [ ] **Step 1: Write the failing e2e test**

```ts
// e2e/gate.spec.ts
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.10' } });
test('redirects to /unlock, rejects a wrong password, accepts the right one and honours next', async ({ page }) => {
  await page.goto('/?post=abc');
  await expect(page).toHaveURL(/\/unlock\?next=%2F%3Fpost%3Dabc/);
  await page.getByLabel('Password').fill('nope'); await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText("That's not the password.")).toBeVisible();
  await page.getByLabel('Password').fill('e2e-password'); await page.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL('/?post=abc');
  await expect(page.getByText("Vilhelm's trip")).toBeVisible();
});
test.describe('lockout', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.11' } });
  test('5 wrong tries lock the IP even for the right password', async ({ page }) => {
    await page.goto('/unlock');
    for (let i = 0; i < 5; i++) { await page.getByLabel('Password').fill('nope'); await page.getByRole('button', { name: 'Open' }).click(); }
    await page.getByLabel('Password').fill('e2e-password'); await page.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByText('Too many tries. Try again in 15 minutes.')).toBeVisible();
  });
});
test('photos and API answer 401 without the cookie, and every response is noindex', async ({ request }) => {
  const r = await request.get('/photos/00000000-0000-0000-0000-000000000000/display');
  expect(r.status()).toBe(401);
  expect((await request.get('/api/feed')).status()).toBe(401);
  expect((await request.get('/unlock')).headers()['x-robots-tag']).toBe('noindex, nofollow');
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose -f docker-compose.dev.yml up -d db && npx playwright install chromium && npm run test:e2e -- gate.spec.ts`. Expected: FAIL (no redirect to `/unlock`).

- [ ] **Step 3: Implement `proxy(request: NextRequest)` in `src/proxy.ts`**

- Matcher: `'/((?!_next/static|_next/image|favicon.ico).*)'`.
- `public` and `self-guarded` paths: return `NextResponse.next()`.
- `reader` paths: allow when `verifyGateToken(cookie)` passes. Otherwise:
  - paths starting `/photos/` or `/api/`: answer 401 with JSON `{ error: 'locked' }`
  - everything else: redirect to `/unlock?next=<encodeURIComponent(pathname + search)>`

- [ ] **Step 4: Implement the unlock page and action**

The page uses Postcard styling with the site title, one `<label>Password</label>` input and an `Open` button. It uses `useActionState(unlock, {})`. Read `next` from `searchParams` and pass it as a hidden field.

The action:
1. Compute `ip = clientIp(await headers(), env.TRUSTED_PROXY_HOPS)` and `key = rateLimitKey(ip)`.
2. Log `console.info('[unlock] ip=%s key=%s', ip, key)`.
3. If locked out, return the locked message and don't record the attempt.
4. Otherwise compare the password with `timingSafeEqual` on the SHA-256 digests, then record the attempt.
5. On success, set `pz_gate` with the constraint attributes and `redirect(safeNextPath(next))`.

- [ ] **Step 5: Run it and confirm it passes**

Run: `npm run test:e2e -- gate.spec.ts`. Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: family password gate with proxy, unlock page and rate limiting"
```

---

### Task 5: Google sign-in, viewer and admin guard

**Files:**
- Create: `src/auth/auth.ts`, `src/auth/auth-client.ts`, `src/auth/viewer.ts`, `src/auth/viewer.test.ts`, `src/db/auth-schema.ts` (generated), `src/app/api/auth/[...all]/route.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/(protected)/layout.tsx`, `src/app/admin/(protected)/page.tsx` (placeholder heading `Posts`), `e2e/auth.setup.ts`
- Modify: `src/db/schema.ts` (re-export auth tables), `src/gate/access.ts`, `src/proxy.ts`, `playwright.config.ts`

**Interfaces:**
- Produces:
  - `auth`, from `betterAuth({ database: drizzleAdapter(getDb(), { provider: 'pg', schema }), socialProviders: { google: {...} }, emailAndPassword: { enabled: getEnv().E2E_TEST_AUTH }, plugins: [nextCookies()] })`. `nextCookies()` stays last.
  - `authClient = createAuthClient()`, from `better-auth/react`.
  - `type ViewerUser = { id: string; name: string; email: string; emailVerified: boolean }`
  - `type Viewer = { user: ViewerUser | null; isAdmin: boolean }`
  - `isAdminUser(user: Pick<ViewerUser, 'email' | 'emailVerified'> | null, adminEmail: string): boolean`
  - `getViewer(headers: Headers): Promise<Viewer>`
  - `requireAdminPage(): Promise<ViewerUser>`, which redirects to `/admin/login`
  - `assertAdmin(): Promise<ViewerUser>`, which throws `Error('Forbidden')`
  - `readerAccess()` now fills in `isAdmin`.
- e2e: `auth.setup.ts` signs up `admin@e2e.test` and `reader@e2e.test` (name `Mum`) through `POST /api/auth/sign-up/email`, then sets `email_verified = true` for the admin only, straight in the DB. It saves the storage states to `e2e/.auth/admin.json` and `e2e/.auth/reader.json`. The reader state also includes a `pz_gate` cookie, obtained by unlocking through the UI. A Playwright `setup` project runs it first.

- [ ] **Step 1: Write the failing unit test**

```ts
// src/auth/viewer.test.ts
test('admin needs matching, verified email (case-insensitive)', () => {
  expect(isAdminUser({ email: 'Vilhelm@PrytzNet.se', emailVerified: true }, 'vilhelm@prytznet.se')).toBe(true);
  expect(isAdminUser({ email: 'vilhelm@prytznet.se', emailVerified: false }, 'vilhelm@prytznet.se')).toBe(false);
  expect(isAdminUser({ email: 'mum@gmail.com', emailVerified: true }, 'vilhelm@prytznet.se')).toBe(false);
  expect(isAdminUser(null, 'vilhelm@prytznet.se')).toBe(false);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/auth`. Expected: FAIL.

- [ ] **Step 3: Implement auth config, route handler (`toNextJsHandler(auth)`) and viewer helpers; generate the Better Auth tables**

Run `npx auth@latest generate` for the Drizzle adapter and write the output to `src/db/auth-schema.ts`. If the CLI can't load the config, hand-write the four core tables (`user`, `session`, `account`, `verification`) per the installed version's docs. Then run `npm run db:generate`.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/auth`. Expected: PASS.

- [ ] **Step 5: Admin login page, guard and proxy admin bypass**

`/admin/login` shows a `Sign in with Google` button, which calls `authClient.signIn.social({ provider: 'google', callbackURL: '/admin' })`. If the viewer is signed in but isn't admin, it shows `Signed in as <email>, which can't post.` and a sign-out button.

`(protected)/layout.tsx` calls `requireAdminPage()`.

In `proxy`, a reader path that fails the gate check still passes when `getSessionCookie(request)` is present and `isAdminUser((await auth.api.getSession({ headers: request.headers }))?.user ?? null, env.ADMIN_EMAIL)` is true.

- [ ] **Step 6: e2e for the guard**

```ts
// e2e/admin-guard.spec.ts
test('anonymous /admin goes to login', async ({ page }) => {
  await page.goto('/admin'); await expect(page).toHaveURL('/admin/login');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
});
test.describe('admin', () => { test.use({ storageState: 'e2e/.auth/admin.json' });
  test('sees admin and the feed without the family password', async ({ page }) => {
    await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
    await page.goto('/'); await expect(page).toHaveURL('/');
  });
});
test.describe('non-admin', () => { test.use({ storageState: 'e2e/.auth/reader.json' });
  test('is refused', async ({ page }) => { await page.goto('/admin'); await expect(page).toHaveURL('/admin/login');
    await expect(page.getByText("which can't post")).toBeVisible(); });
});
```

Run: `npm run test:e2e`. Expected: PASS (all specs so far).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: Better Auth Google sign-in, admin guard and admin gate bypass"
```

---

### Task 6: Photo storage and serving

**Files:**
- Create: `src/storage/storage.ts`, `src/storage/s3.ts`, `src/storage/fs.ts`, `src/storage/fs.test.ts`, `src/photos/serve.ts`, `src/photos/serve.test.ts`, `src/app/photos/[photoId]/[size]/route.ts`, `src/app/api/dev-storage/[...key]/route.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Storage {
    presignPut(key: string, contentType: string): Promise<string>;           // URL valid 15 min
    head(key: string): Promise<{ size: number; contentType: string } | null>;
    get(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number; contentType: string } | null>;
    delete(keys: string[]): Promise<void>;
  }
  export function getStorage(): Storage;                                       // by STORAGE_DRIVER, singleton
  export function createS3Storage(cfg: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }): Storage;
  export function createFsStorage(dir: string): Storage & { put(key: string, bytes: Uint8Array, contentType: string): Promise<void> };
  export async function servePhoto(deps: { db: Db; storage: Storage }, req: { photoId: string; size: string; hasGate: boolean; isAdmin: boolean }): Promise<Response>;
  ```
- S3 client settings: `region: 'auto'`, `forcePathStyle: true`, `requestChecksumCalculation: 'WHEN_REQUIRED'`. Without the last one, the SDK adds checksum headers that break presigned browser PUTs to R2. The presigned PUT signs `ContentType`.
- The fs driver's `presignPut` returns `/api/dev-storage/<key>`. That route accepts PUT only when `STORAGE_DRIVER === 'fs'` and `assertAdmin()` passes. It stores the file plus `<file>.meta.json` holding `{ contentType }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/photos/serve.test.ts  — createTestDb() + createFsStorage(tmpdir); helper seedPhoto(status, postStatus)
test('reader gets a published photo with immutable private caching', async () => {
  const id = await seedPhoto('ready', 'published');
  const res = await servePhoto(deps, { photoId: id, size: 'display', hasGate: true, isAdmin: false });
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
  expect(res.headers.get('content-type')).toBe('image/webp');
});
test('no gate and not admin → 401', async () =>
  expect((await servePhoto(deps, { photoId: await seedPhoto('ready', 'published'), size: 'display', hasGate: false, isAdmin: false })).status).toBe(401));
test('draft photo: 404 for readers, 200 for admin', async () => {
  const id = await seedPhoto('ready', 'draft');
  expect((await servePhoto(deps, { photoId: id, size: 'thumb', hasGate: true, isAdmin: false })).status).toBe(404);
  expect((await servePhoto(deps, { photoId: id, size: 'thumb', hasGate: false, isAdmin: true })).status).toBe(200);
});
test.each([['pending photo', 'pending'], ['bad size', 'ready']])('%s → 404', async (_, st) => {
  const id = await seedPhoto(st as 'pending' | 'ready', 'published');
  expect((await servePhoto(deps, { photoId: id, size: st === 'ready' ? 'huge' : 'display', hasGate: true, isAdmin: false })).status).toBe(404);
});
test('non-uuid id → 404 without querying', async () =>
  expect((await servePhoto(deps, { photoId: 'nope', size: 'display', hasGate: true, isAdmin: false })).status).toBe(404));

// src/storage/fs.test.ts
test('put/head/get/delete round trip; missing → null', async () => { /* put 'a/b.webp' → head size 3, get body bytes equal, delete → head null */ });
test('rejects keys escaping the dir', async () => expect(s.put('../x', new Uint8Array(1), 'image/webp')).rejects.toThrow());
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/photos src/storage`. Expected: FAIL.

- [ ] **Step 3: Implement storage drivers, `servePhoto`, the photo route, and the dev-storage route**

The photo route computes `hasGate` with `verifyGateToken`, takes `isAdmin` from `getViewer`, and delegates to `servePhoto`.

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run src/photos src/storage`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: R2/fs storage drivers and access-checked photo serving"
```

---

### Task 7: Posts repository, admin actions and upload API

**Files:**
- Create: `src/posts/types.ts`, `src/posts/repo.ts`, `src/posts/repo.test.ts`, `src/posts/format.ts`, `src/posts/format.test.ts`, `src/posts/actions.ts`, `src/app/api/admin/uploads/route.ts`, `src/app/api/admin/uploads/[photoId]/complete/route.ts`
- Modify: `src/instrumentation.ts` (call `cleanupStalePhotos` after migrations)

**Interfaces:**
- Produces, in `src/posts/types.ts`:
  ```ts
  type PhotoMeta = { takenAtLocal: string | null; utcOffset: string | null; lat: number | null; lng: number | null };
  type PhotoView = { id: string; width: number; height: number; displayUrl: string; thumbUrl: string }; // `/photos/{id}/display|thumb`
  type EditablePost = { id: string; title: string; description: string; placeName: string; lat: number | null; lng: number | null;
    takenAtLocal: string | null; utcOffset: string | null; status: 'draft' | 'published'; headlinePhotoId: string | null;
    photos: (PhotoView & PhotoMeta)[] /* ready only, sortOrder asc */ };
  type PostFieldsInput = Omit<EditablePost, 'id' | 'status' | 'photos'> & { photoOrder: string[] };
  type FeedPost = { id: string; title: string; description: string; placeName: string; lat: number; lng: number;
    takenAtLocal: string; headline: PhotoView; photos: PhotoView[] /* excluding headline */ };
  type FeedPage = { posts: FeedPost[]; nextCursor: string | null };
  type RoutePoint = { id: string; title: string; dateLabel: string; lat: number; lng: number };
  type AdminPostRow = { id: string; title: string; status: 'draft' | 'published'; takenAtLocal: string | null; photoCount: number };
  ```
- Produces, in `src/posts/repo.ts` (every function takes `db: Db` first):
  - `createDraft(db): Promise<string>`
  - `getPostForEdit(db, id): Promise<EditablePost | null>`
  - `savePostFields(db, id, input: PostFieldsInput): Promise<void>`. Rewrites each photo's `sortOrder` from `photoOrder`.
  - `validateForPublish(post: EditablePost): string[]`. Exact messages, in this order: `Add a title`, `Choose a headline photo`, `Set a location`, `Set a date`.
  - `setPublished(db, id, published: boolean, now: Date): Promise<{ ok: true } | { ok: false; errors: string[] }>`
  - `deletePost(db, storage, id): Promise<void>`. Deletes the storage objects, then the row.
  - `listAdminPosts(db): Promise<AdminPostRow[]>`. All posts, newest `takenAtLocal` first; nulls first.
  - `createPendingPhoto(db, postId, meta: PhotoMeta & { width: number; height: number; contentType: 'image/webp' | 'image/jpeg' }): Promise<{ photoId: string; displayKey: string; thumbKey: string }>`. Keys are `photos/<photoId>/display.<webp|jpg>` and `photos/<photoId>/thumb.<webp|jpg>`.
  - `completePhoto(db, storage, photoId): Promise<{ ok: true; photo: PhotoView & PhotoMeta } | { ok: false; reason: string }>`. Checks that both objects exist with the expected content type, display ≤ 15 MB and thumb ≤ 2 MB. On success: `status='ready'`, `sortOrder = max + 1`, and the post's headline is set if it was null. On failure it deletes the objects and the row.
  - `removePhoto(db, storage, photoId): Promise<void>`. If the photo was the headline, the headline moves to the first remaining photo, or null.
  - `listFeedPage(db, opts: { cursor?: string; limit: number; throughId?: string }): Promise<FeedPage>`. Published posts only, ordered `takenAtLocal desc, createdAt desc, id desc`. The cursor is opaque base64url. With `throughId`, it returns every post from the cursor down to and including that post, ignoring `limit`. If that post isn't published, it returns a normal page.
  - `listRoutePoints(db): Promise<RoutePoint[]>`. Published posts, oldest first.
  - `cleanupStalePhotos(db, storage, now: Date): Promise<number>`. Deletes `pending` photos older than 24h.
- Produces, in `src/posts/format.ts`: `formatPostDate(takenAtLocal: string): string`. Example: `'2026-10-24T14:03:00'` → `'Fri 24 Oct'`, using `en-GB` weekday/day/month with `timeZone: 'UTC'` on the wall-clock value.
- Admin server actions in `src/posts/actions.ts`. Each one calls `assertAdmin()` first:
  - `createDraftAction(): Promise<never>`, which redirects to `/admin/posts/<id>`
  - `savePostAction(id, input)`
  - `publishAction(id)` and `unpublishAction(id)`, both returning the `setPublished` result
  - `deletePostAction(id): Promise<never>`, which redirects to `/admin`
  - `removePhotoAction(photoId)`
- Upload routes, admin-only (401 otherwise):
  - `POST /api/admin/uploads` with body `{ postId, meta }` returns `{ photoId, displayPutUrl, thumbPutUrl }`.
  - `POST /api/admin/uploads/<photoId>/complete` returns `{ photo }`, or 422 `{ reason }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/posts/repo.test.ts (PGlite + fs storage; helper makePublished(title, takenAtLocal, nPhotos))
test('feed: published only, newest first, cursor pages', async () => {
  await makePublished('A', '2026-10-18T10:00:00', 1); await makePublished('C', '2026-10-24T10:00:00', 2);
  await makePublished('B', '2026-10-21T10:00:00', 1); await createDraft(db);
  const p1 = await listFeedPage(db, { limit: 2 });
  expect(p1.posts.map(p => p.title)).toEqual(['C', 'B']);
  const p2 = await listFeedPage(db, { limit: 2, cursor: p1.nextCursor! });
  expect(p2.posts.map(p => p.title)).toEqual(['A']); expect(p2.nextCursor).toBeNull();
});
test('feed: throughId loads down to that post', async () => { /* 5 posts, limit 2, throughId = oldest → 5 posts returned */ });
test('feed: headline excluded from photos list', async () => { /* post with 3 photos → headline + photos.length 2 */ });
test('empty feed → no posts, null cursor; empty route', async () => {
  expect(await listFeedPage(db, { limit: 8 })).toEqual({ posts: [], nextCursor: null });
  expect(await listRoutePoints(db)).toEqual([]);
});
test('route points oldest first with date labels', async () => { /* titles A,B,C; dateLabel 'Sat 18 Oct' */ });
test('publish validation lists every missing field', async () => {
  const id = await createDraft(db);
  expect(await setPublished(db, id, true, new Date())).toEqual({ ok: false,
    errors: ['Add a title', 'Choose a headline photo', 'Set a location', 'Set a date'] });
});
test('complete: first ready photo becomes headline; oversize display rejected and cleaned up', async () => { /* fs put 16MB → ok:false, row gone, head null */ });
test('complete: wrong content type rejected', async () => { /* fs put display as 'image/png' → ok:false, reason matches /type/ */ });
test('removePhoto moves headline to next photo', async () => { /* 2 ready photos, remove headline → post.headlinePhotoId === 2nd id; remove last → null */ });
test('deletePost removes storage objects', async () => { /* post with 1 photo → deletePost → storage.head(displayKey) and head(thumbKey) null, post row gone */ });
test('cleanupStalePhotos removes pending older than 24h only', async () => { /* pending@-25h, pending@-1h, ready@-48h → returns 1; only the -25h row gone */ });

// src/posts/format.test.ts
test('formats wall clock without shifting zones', () => {
  expect(formatPostDate('2026-10-24T23:59:00')).toBe('Fri 24 Oct');
  expect(formatPostDate('2026-11-01T00:30:00')).toBe('Sun 1 Nov');
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/posts`. Expected: FAIL.

- [ ] **Step 3: Implement types, repo, format, actions and upload routes per Interfaces**

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run src/posts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: posts/photos repository, admin actions and presigned upload API"
```

---

### Task 8: In-browser photo pipeline

**Files:**
- Create: `src/client/exif.ts`, `src/client/exif.test.ts`, `src/client/post-defaults.ts`, `src/client/post-defaults.test.ts`, `src/client/resize.ts`, `src/client/upload.ts`, `src/client/upload.test.ts`

**Interfaces:**
- Consumes: `PhotoMeta`, the upload routes from Task 7.
- Produces:
  - `summarizeExif(tags: { DateTimeOriginal?: string; CreateDate?: string; OffsetTimeOriginal?: string; OffsetTime?: string } | undefined, gps: { latitude: number; longitude: number } | undefined): PhotoMeta`
  - `readPhotoMeta(file: File): Promise<PhotoMeta>`. Calls `exifr.parse(file, { pick: [...], reviveValues: false })` and `exifr.gps(file)`, then `summarizeExif`. Any exifr error yields all nulls.
  - `pickPostDefaults(photos: PhotoMeta[], headlineIndex: number): PhotoMeta & { locationSource: 'headline' | 'other' | null }`. Date is the earliest `takenAtLocal`, with its offset. Location is the headline's GPS, else the first other photo with GPS.
  - `resizeImage(file: File, maxEdge: number, quality: number): Promise<{ blob: Blob; width: number; height: number; contentType: 'image/webp' | 'image/jpeg' }>`. Uses `createImageBitmap(file, { imageOrientation: 'from-image' })` and an `OffscreenCanvas`. Never upscales. If the WebP blob type isn't `image/webp`, it re-encodes as JPEG.
  - `uploadWithRetry(put: () => Promise<Response>, opts?: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<void>`. Defaults: 4 attempts, 1000ms. Backoff is `baseDelayMs * 2^(n-1)`. It retries network errors and 5xx, throws immediately on 4xx, and throws `UploadFailedError` after the last attempt.
  - `uploadPhoto(file: File, postId: string, onStage: (s: UploadStage) => void): Promise<PhotoView & PhotoMeta>`, where `type UploadStage = { kind: 'reading' | 'resizing' | 'uploading' | 'finishing' | 'done' } | { kind: 'uploading'; pct: number } | { kind: 'failed'; message: string }`. Upload progress uses `XMLHttpRequest` with the `Content-Type` header equal to the signed type.

- [ ] **Step 1: Write the failing tests**

```ts
// exif.test.ts
test('reads wall clock, offset and GPS', () => expect(summarizeExif(
  { DateTimeOriginal: '2026:10:24 14:03:11', OffsetTimeOriginal: '+13:00' }, { latitude: -45.03, longitude: 168.66 }))
  .toEqual({ takenAtLocal: '2026-10-24T14:03:11', utcOffset: '+13:00', lat: -45.03, lng: 168.66 }));
test('falls back to CreateDate / OffsetTime', () => expect(summarizeExif({ CreateDate: '2026:10:24 09:00:00', OffsetTime: '-07:00' }, undefined))
  .toEqual({ takenAtLocal: '2026-10-24T09:00:00', utcOffset: '-07:00', lat: null, lng: null }));
test('nothing → all null', () => expect(summarizeExif(undefined, undefined)).toEqual({ takenAtLocal: null, utcOffset: null, lat: null, lng: null }));
test.each([[{ latitude: 0, longitude: 0 }], [{ latitude: NaN, longitude: 1 }], [{ latitude: 91, longitude: 1 }]])('bad GPS %j → null', g =>
  expect(summarizeExif(undefined, g).lat).toBeNull());
test('garbage date → null', () => expect(summarizeExif({ DateTimeOriginal: '0000:00:00 00:00:00' }, undefined).takenAtLocal).toBeNull());

// post-defaults.test.ts
const m = (t: string | null, lat: number | null = null, lng: number | null = null): PhotoMeta => ({ takenAtLocal: t, utcOffset: null, lat, lng });
test('earliest date, headline location', () => expect(pickPostDefaults([m('2026-10-24T15:00:00', 1, 2), m('2026-10-24T09:00:00', 3, 4)], 0))
  .toMatchObject({ takenAtLocal: '2026-10-24T09:00:00', lat: 1, lng: 2, locationSource: 'headline' }));
test('headline without GPS → first other with GPS', () => expect(pickPostDefaults([m(null, 3, 4), m(null)], 1))
  .toMatchObject({ lat: 3, lng: 4, locationSource: 'other' }));
test('no data at all', () => expect(pickPostDefaults([m(null), m(null)], 0))
  .toEqual({ takenAtLocal: null, utcOffset: null, lat: null, lng: null, locationSource: null }));

// upload.test.ts
const sleep = vi.fn(async () => {});
test('retries 5xx then succeeds', async () => {
  const put = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response(null, { status: 200 }));
  await uploadWithRetry(put, { sleep }); expect(put).toHaveBeenCalledTimes(2); expect(sleep).toHaveBeenCalledWith(1000);
});
test('network errors retried with backoff, gives up after 4', async () => {
  const put = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(uploadWithRetry(put, { sleep })).rejects.toBeInstanceOf(UploadFailedError);
  expect(put).toHaveBeenCalledTimes(4); expect(sleep.mock.calls.map(c => c[0])).toEqual([1000, 2000, 4000]);
});
test('4xx is not retried', async () => {
  const put = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
  await expect(uploadWithRetry(put, { sleep })).rejects.toThrow(); expect(put).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/client`. Expected: FAIL.

- [ ] **Step 3: Implement the four modules per Interfaces**

`resizeImage` and `uploadPhoto` are browser-only. The Task 10 e2e covers them.

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run src/client`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client && git commit -m "feat: client EXIF reading, post defaults, resizing and resilient uploads"
```

---

### Task 9: Place names

**Files:**
- Create: `src/geo/place-name.ts`, `src/geo/place-name.test.ts`, `src/app/api/admin/geocode/route.ts`

**Interfaces:**
- Produces:
  - `formatPlaceName(address: Record<string, string> | undefined): string`.
    - Locality is the first of `city`, `town`, `village`, `hamlet`, `suburb`, `municipality`, `county`.
    - For `country_code === 'us'`, the result is `<locality>, <state>`. Otherwise it is `<locality>, <country>`.
    - Without a locality: `<state>, <country>`, then just `<country>`, then `''`.
  - `GET /api/admin/geocode?lat&lng` is admin-only and returns `{ placeName: string }`.
    - It calls `${NOMINATIM_URL}/reverse?format=jsonv2&lat=..&lon=..&zoom=10&accept-language=en` with the constraint User-Agent.
    - A module-level timestamp spaces calls at least 1s apart.
    - When `NOMINATIM_URL` is empty, or the call fails, it returns `{ placeName: '' }` with status 200.

- [ ] **Step 1: Write the failing test**

```ts
test.each([
  [{ town: 'Queenstown', state: 'Otago', country: 'New Zealand', country_code: 'nz' }, 'Queenstown, New Zealand'],
  [{ city: 'San Francisco', state: 'California', country: 'United States', country_code: 'us' }, 'San Francisco, California'],
  [{ village: 'Lake Tekapo', country: 'New Zealand', country_code: 'nz' }, 'Lake Tekapo, New Zealand'],
  [{ state: 'Tasman', country: 'New Zealand', country_code: 'nz' }, 'Tasman, New Zealand'],
  [{ country: 'Singapore', country_code: 'sg' }, 'Singapore'],
  [undefined, ''],
])('%j → %s', (a, out) => expect(formatPlaceName(a)).toBe(out));
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/geo/place-name.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `formatPlaceName` and the route**

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/geo/place-name.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geo src/app/api/admin/geocode && git commit -m "feat: reverse-geocoded place names via Nominatim"
```

---

### Task 10: Admin UI (phone-first)

**Files:**
- Modify: `src/app/admin/(protected)/page.tsx`
- Create: `src/app/admin/(protected)/posts/[id]/page.tsx`, `src/components/admin/PostEditor.tsx`, `src/components/admin/PhotoTray.tsx`, `src/components/admin/LocationPicker.tsx`, `e2e/fixtures.ts`, `e2e/admin.spec.ts`

**Interfaces:**
- Consumes: the Task 7 actions and routes, the Task 8 client functions, the Task 9 route.
- Produces:
  - `/admin` lists `listAdminPosts` rows, each with a `Draft` or `Published` badge. A `New post` button submits `createDraftAction`.
  - `/admin/posts/[id]` renders `<PostEditor initial={EditablePost} />`.
  - Photo tiles have `data-testid="photo-tile"` and `data-width`/`data-height` (the stored size after rotation).
  - The location source label has `data-testid="location-source"` and reads exactly `From photo GPS`, `From your phone` or `Pinned by hand`.
  - `LocationPicker({ value, onChange })`, where `value: { lat: number | null; lng: number | null }` and `onChange(v: { lat: number; lng: number; source: 'photo' | 'device' | 'pin' })`:
    - a Leaflet map with a draggable marker, using Esri World Imagery tiles
    - tapping the map moves the pin
    - a `Use my current location` button calls `navigator.geolocation.getCurrentPosition`
- Editor behaviour, all phone-first in a single column at a 360px width:
  1. **Photos.** An `Add photos` file input (`accept="image/*" multiple`) feeds a queue that runs 2 uploads at a time. Each tile shows its stage, or `Retry` when failed. Completed tiles have a `Headline` toggle (a star) and `Remove`.
  2. **Defaults.** After uploads complete, `pickPostDefaults` fills `takenAtLocal`, `utcOffset` and location, but only fields that are still empty. It never overwrites the admin's edits.
  3. **Missing location.** If no location is known after uploads, show `No location in these photos. Use your current location or drop a pin.`
  4. **Fields.** `Title` (text), `Description` (textarea; rendered with `white-space: pre-line` on the site), `Date` (`datetime-local` bound to `takenAtLocal`), location, and `Place` (text).
  5. **Place name.** Re-fetch it from the geocode route whenever the location changes, unless the admin has typed in `Place`.
  6. **Autosave.** Fields autosave through `savePostAction` 1500ms after the last change. The status line reads `Saving…`, `Saved` or `Not saved, retrying`.
  7. **Buttons.** `Publish` (or `Unpublish`), `Delete` (behind a `confirm()`), and `View on site` (`/?post=<id>`, shown once published). Publish errors appear as a list using the exact `validateForPublish` messages.

- [ ] **Step 1: Write the failing e2e test**

`e2e/fixtures.ts` exports `makeJpeg(page, opts: { gps?: [number, number]; date?: string; orientation?: number }): Promise<Buffer>`. It takes a `page.screenshot({ type: 'jpeg' })` of a 400×300 coloured box, then inserts EXIF with `piexifjs`.

```ts
// e2e/admin.spec.ts
test.use({ storageState: 'e2e/.auth/admin.json', viewport: { width: 390, height: 844 } });
test('create, fill from EXIF, publish, appears on feed', async ({ page }) => {
  await page.goto('/admin'); await page.getByRole('button', { name: 'New post' }).click();
  await expect(page).toHaveURL(/\/admin\/posts\//);
  const a = await makeJpeg(page, { gps: [-45.0312, 168.6626], date: '2026:11:02 10:15:00' });
  const b = await makeJpeg(page, { date: '2026:11:02 09:40:00' });
  await page.getByLabel('Add photos').setInputFiles([{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: a }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: b }]);
  await expect(page.getByTestId('photo-tile').filter({ hasText: 'Done' })).toHaveCount(2);
  await expect(page.getByLabel('Date')).toHaveValue('2026-11-02T09:40');
  await expect(page.getByTestId('location-source')).toHaveText('From photo GPS');
  await page.getByLabel('Title').fill('Queenstown'); await page.getByLabel('Place').fill('Queenstown, New Zealand');
  await expect(page.getByText('Saved')).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();
  await page.goto('/admin'); await expect(page.getByRole('listitem').filter({ hasText: 'Queenstown' })).toContainText('Published');
});
test('no GPS prompts for location and publish lists errors', async ({ page }) => {
  await page.goto('/admin'); await page.getByRole('button', { name: 'New post' }).click();
  await page.getByLabel('Add photos').setInputFiles([{ name: 'c.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(page, {}) }]);
  await expect(page.getByText('No location in these photos.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Add a title')).toBeVisible(); await expect(page.getByText('Set a location')).toBeVisible();
});
test('rotated photo stored upright', async ({ page }) => {
  // 400×300 source with EXIF orientation 6 → stored photo width 300, height 400 (read from the tile's data-width/data-height)
});
test('failed upload shows Retry and keeps finished photos', async ({ page }) => {
  // page.route('**/api/dev-storage/**', r => r.abort()) for the 2nd file only → tile 1 'Done', tile 2 'Retry'; unroute, click Retry → 'Done'
});
test('draft survives reload', async ({ page }) => { /* fill Title, wait 'Saved', reload → Title value kept */ });
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:e2e -- admin.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the admin list, editor, photo tray and location picker per Interfaces**

Import Leaflet only inside client components, loaded with `next/dynamic` and `{ ssr: false }`, and import `leaflet/dist/leaflet.css` there.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test:e2e -- admin.spec.ts`. Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: phone-first admin editor with uploads, EXIF defaults and location picker"
```

---

### Task 11: Docker image, deploy checks and README

**Files:**
- Modify: `Dockerfile` (add one line only)
- Create: `README.md`

**Interfaces:**
- Consumes: Tasks 1–10. This is the first deployable milestone. Vilhelm can deploy now, start backfilling posts privately and run the Android GPS check, while Tasks 12–14 build the reader side. Nobody gets the link until Task 14 is done.

- [ ] **Step 1: Add the migrations folder to the runner stage**

After the `.next/static` COPY, add:
`COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle`

- [ ] **Step 2: Build and run the image against dev Postgres**

Run:
```bash
docker build -t prytz-nz .
docker run --rm -p 3200:3000 --env-file .env.local -e DATABASE_URL=postgres://postgres:dev@host.docker.internal:5433/prytz -e BETTER_AUTH_URL=http://localhost:3200 prytz-nz
```
Expected: the container logs show the server listening and no migration errors.

- [ ] **Step 3: Smoke-check the container**

Run: `curl -sI localhost:3200/ | grep -iE '^(location|x-robots-tag)'`. Expected: `location: /unlock?next=%2F` and `x-robots-tag: noindex, nofollow`.

Run: `curl -s -X POST localhost:3200/unlock -H 'x-forwarded-for: 198.51.100.7' ...` (or submit the form in a browser). Expected: the container log shows `[unlock] ip=198.51.100.7 key=198.51.100.7`.

- [ ] **Step 4: Write `README.md`**

Sections, in order:
1. **What it is.**
2. **Local dev:** compose up, `.env.local`, `npm run dev`, `npm test`, `npm run test:e2e`.
3. **Google OAuth client:** authorized redirect URIs `https://prytz.nz/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`.
4. **Cloudflare R2:**
   - Create a private bucket and an R2 API token scoped to the bucket with Object Read & Write.
   - `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
   - Bucket CORS JSON: AllowedOrigins `https://prytz.nz` and `http://localhost:3000`, AllowedMethods `PUT`, AllowedHeaders `Content-Type`, MaxAgeSeconds 3600.
5. **Dokploy:**
   - Create a Postgres database and an application built from the Dockerfile, with domain `prytz.nz` and HTTPS on.
   - Set the env vars from `.env.example`. Never set `E2E_TEST_AUTH`.
   - Set up Postgres backups to an S3 destination; the R2 account works.
6. **DNS:** an A/AAAA record for prytz.nz pointing at the Dokploy host.
7. **First-deploy check:**
   - Enter a wrong password from your phone. The log line `[unlock] ip=…` must show your phone's public IP, not a Docker or Traefik address.
   - If it doesn't, adjust `TRUSTED_PROXY_HOPS`.
8. **Changing the family password:** this signs everyone out.
9. **Android GPS check:** create a test post from your phone and confirm that `From photo GPS` appears. If it never does, use `Use my current location`.

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm test && npm run test:e2e && npm run build`. Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile README.md && git commit -m "chore: ship migrations in image, add setup and deploy README"
```

---

### Task 12: Feed page and lightbox

**Files:**
- Modify: `src/app/page.tsx`, `src/app/api/feed/route.ts`, `e2e/seed.ts`
- Create: `src/components/feed/TripLayout.tsx`, `src/components/feed/Feed.tsx`, `src/components/feed/PostCard.tsx`, `src/components/feed/Lightbox.tsx`, `e2e/feed.spec.ts`

**Interfaces:**
- Consumes: `listFeedPage`, `listRoutePoints`, `formatPostDate`.
- Produces:
  - `GET /api/feed?cursor&through` returns a `FeedPage` (page size 8).
  - `src/app/page.tsx` is a server component. Given `?post=<id>`, it loads the first page with `throughId` set to that id.
  - `<TripLayout initialPage={FeedPage} route={RoutePoint[]} focusPostId={string | null} />` is a client component. It owns `activeId` and `mapHidden` state. Task 13 plugs the map into its right-hand slot; until then the slot renders an empty `<aside>`.
  - `<Feed>`:
    - renders `<article id="post-<id>" data-post-id>` cards newest first, then loads the next page when a sentinel enters view
    - exposes `ensureLoaded(id: string): Promise<void>`, which fetches with `through=id` when the post isn't loaded yet
    - calls `onActiveChange(id)` from an `IntersectionObserver` (rootMargin `-35% 0px -55% 0px`)
  - `PostCard` follows the prototype, in this order: meta line (`formatPostDate` · place), title as `<h2>`, 3:2 headline, description, then up to 5 thumbnails, with `+N` on the fifth when there are more than 5 photos.
  - `<Lightbox photos={PhotoView[]} index={number} caption={string} onClose={() => void} />` is the full-screen viewer:
    - ArrowLeft/ArrowRight and Esc on desktop, plus visible ‹ › × buttons
    - a horizontal pointer swipe of 50px or more changes photo
    - the caption reads `<title> · <i> / <n>`
  - Empty state: when there are no posts, show `No posts yet. Check back soon.`
- `e2e/seed.ts` creates, through the repo and fs storage, using a 1×1 WebP fixture:
  - published `Leaving Stockholm` (2026-10-15, 59.33/18.07, 1 photo)
  - published `Landed!` (2026-10-18, 34.05/-118.24, 1 photo)
  - published `Museum X` (2026-10-24, 37.77/-122.47, 8 photos, description `Line one\nLine two`)
  - published `Auckland` (2026-11-01, -36.85/174.76, 2 photos)
  - draft `Secret draft` (1 photo)

  It exports the ids.

- [ ] **Step 1: Write the failing e2e test**

```ts
// e2e/feed.spec.ts
test.use({ storageState: 'e2e/.auth/reader.json' });
test('newest first, drafts hidden, line breaks kept', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('article h2')).toHaveText(['Auckland', 'Museum X', 'Landed!', 'Leaving Stockholm']);
  await expect(page.getByText('Secret draft')).toHaveCount(0);
  await expect(page.locator('#post-' + ids.museum).getByText('+4')).toBeVisible();
  expect(await page.locator('#post-' + ids.museum + ' p').evaluate(e => getComputedStyle(e).whiteSpace)).toBe('pre-line');
});
test('draft photo URL is 404 for readers', async ({ request }) =>
  expect((await request.get(`/photos/${ids.draftPhoto}/display`)).status()).toBe(404));
test('lightbox: open, arrow, escape', async ({ page }) => {
  await page.goto('/'); await page.locator('#post-' + ids.museum + ' figure').click();
  await expect(page.getByText('Museum X · 1 / 8')).toBeVisible();
  await page.keyboard.press('ArrowRight'); await expect(page.getByText('Museum X · 2 / 8')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByText('Museum X · 2 / 8')).toHaveCount(0);
});
test('deep link scrolls to the post', async ({ page }) => {
  await page.goto('/?post=' + ids.stockholm); await expect(page.locator('#post-' + ids.stockholm)).toBeInViewport();
});
```

The empty-state test runs in a separate `e2e/empty.spec.ts`, in its own Playwright project with `baseURL` `http://localhost:3101`. Add a second `webServer` on port 3101 with the same env but `DATABASE_URL=postgres://postgres:dev@localhost:5433/prytz_e2e_empty`. Add `CREATE DATABASE prytz_e2e_empty;` to `docker/initdb/01-e2e.sql`, and have `global-setup.ts` reset that database without seeding it. The test unlocks, then expects `No posts yet. Check back soon.` (Task 13 adds the assertion that the map shows zero `.trip-dot`).

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:e2e -- feed.spec.ts empty.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Implement page, feed API, `TripLayout`, `Feed`, `PostCard` and `Lightbox`**

Use the prototype's Postcard CSS as CSS Modules: feed max-width ~1000px, gallery gap 12px, 4px radius.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test:e2e -- feed.spec.ts empty.spec.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: reader feed with pagination, deep links and full-screen viewer"
```

---

### Task 13: Trip map

**Files:**
- Create: `src/geo/unwrap.ts`, `src/geo/unwrap.test.ts`, `src/components/map/TripMap.tsx`, `e2e/map.spec.ts`
- Modify: `src/components/feed/TripLayout.tsx`

**Interfaces:**
- Produces:
  - `unwrapLongitudes<T extends { lat: number; lng: number }>(points: T[]): T[]`. Input must be oldest first. Each `lng` after the first gets ±360k added to minimise the jump from the previous output point.
  - `<TripMap points={RoutePoint[]} activeId={string | null} onSelect={(id: string) => void} />`, loaded with `next/dynamic` and `{ ssr: false }`:
    - **Tiles:** Esri World Imagery, `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`, with attribution `Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community`.
    - **Route:** a solid white polyline, weight 3, through the unwrapped points. Leave it out when there are fewer than 2 points.
    - **Dots:** `divIcon` markers with class `trip-dot`, white with an accent ring. The active one adds `active` (filled accent, scale 1.5) and opens its tooltip `<title> · <dateLabel>`.
    - **Click:** a click on a dot calls `onSelect`.
    - **Following:** when `activeId` changes and its point is outside `map.getBounds().pad(-0.15)`, `panTo` it.
    - **Buttons:** `Whole trip` runs `fitBounds` over all points (padding 50). `Hide map` sets `mapHidden`.
  - `TripLayout` behaviour:
    - Desktop grid is `2fr 1fr`. When the map is hidden it becomes `1fr 0fr`, and a floating `Show map` button appears.
    - The hidden state persists in localStorage key `pz:mapHidden`; every access is wrapped in try/catch.
    - At ≤ 820px width, the map is a strip on top at 35vh, and hiding it collapses it to 0.
    - Selecting a dot calls `await feed.ensureLoaded(id)`, then `scrollIntoView({ behavior: 'smooth' })`.
    - After a show/hide transition, call `map.invalidateSize()`.

- [ ] **Step 1: Write the failing tests**

```ts
// unwrap.test.ts
test('round-the-world trip goes west across the Pacific, never back over Europe', () => {
  const out = unwrapLongitudes([{ lat: 59.33, lng: 18.07 }, { lat: 34.05, lng: -118.24 }, { lat: -36.85, lng: 174.76 }, { lat: 1.35, lng: 103.82 }, { lat: 59.33, lng: 18.07 }]);
  expect(out.map(p => Math.round(p.lng * 100) / 100)).toEqual([18.07, -118.24, -185.24, -256.18, -341.93]);
});
test('empty and single', () => { expect(unwrapLongitudes([])).toEqual([]); expect(unwrapLongitudes([{ lat: 1, lng: 2 }])).toEqual([{ lat: 1, lng: 2 }]); });
test('keeps extra fields', () => expect(unwrapLongitudes([{ lat: 0, lng: 170, id: 'a' }, { lat: 0, lng: -170, id: 'b' }])[1]).toEqual({ lat: 0, lng: 190, id: 'b' }));

// e2e/map.spec.ts (reader)
test('one dot per published post; clicking the oldest scrolls to it', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.trip-dot')).toHaveCount(4);
  await page.locator(`.trip-dot[data-post-id="${ids.stockholm}"]`).click();
  await expect(page.locator('#post-' + ids.stockholm)).toBeInViewport();
});
test('scrolling activates the matching dot', async ({ page }) => {
  await page.goto('/'); await page.locator('#post-' + ids.landed).scrollIntoViewIfNeeded();
  await expect(page.locator(`.trip-dot[data-post-id="${ids.landed}"]`)).toHaveClass(/active/);
});
test('hide map persists across reload', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Hide map' }).click();
  await page.reload(); await expect(page.getByRole('button', { name: 'Show map' })).toBeVisible();
});
// e2e/empty.spec.ts gains: await expect(page.locator('.trip-dot')).toHaveCount(0); and no console errors (page.on('pageerror') collects none)
test('phone: map strip above feed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const map = await page.getByTestId('trip-map').boundingBox(); const first = await page.locator('article').first().boundingBox();
  expect(map!.y).toBeLessThan(first!.y);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/geo/unwrap.test.ts && npm run test:e2e -- map.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `unwrapLongitudes`, `TripMap`, and the `TripLayout` wiring**

Each `.trip-dot` element carries `data-post-id`.

Check Esri's current terms for keyless basemap tile use. If keyless use isn't allowed, switch to MapTiler `satellite-v2` with `NEXT_PUBLIC_MAPTILER_KEY`, and add that key to `.env.example` and the README.

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run src/geo/unwrap.test.ts && npm run test:e2e -- map.spec.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: satellite trip map linked to the feed, date-line aware"
```

---

### Task 14: Reactions

**Files:**
- Create: `src/reactions/emoji.ts`, `src/reactions/repo.ts`, `src/reactions/repo.test.ts`, `src/reactions/summary.ts`, `src/reactions/summary.test.ts`, `src/reactions/actions.ts`, `src/components/feed/ReactionRow.tsx`, `e2e/reactions.spec.ts`, `drizzle/*` (generated)
- Modify: `src/db/schema.ts`, `src/app/page.tsx`, `src/app/api/feed/route.ts`, `src/components/feed/PostCard.tsx`

**Interfaces:**
- Produces:
  - `REACTIONS = ['❤️', '👍', '😂', '😮', '🙌'] as const`; `type Reaction = typeof REACTIONS[number]`
  - Table `reactions`: `postId` (uuid, fk `posts`, cascade), `userId` (text, fk `user`, cascade), `emoji` (text), `createdAt` (timestamptz). Primary key `(postId, userId, emoji)`.
  - `toggleReaction(db, { postId, userId, emoji }): Promise<'added' | 'removed'>`. Throws `Error('Not found')` for unpublished or missing posts, and `Error('Bad emoji')` for anything outside `REACTIONS`.
  - `listReactions(db, postIds: string[]): Promise<{ postId: string; emoji: Reaction; userId: string; name: string; createdAt: Date }[]>`
  - `summarizeReactions(rows, viewerId: string | null): ReactionSummary[]`, where `type ReactionSummary = { emoji: Reaction; count: number; names: string[]; mine: boolean }`.
    - Only emoji in use are included, in `REACTIONS` order.
    - `names` holds first names (first word of the Google name), earliest first.
    - The viewer appears as `You`, moved to the front.
  - `formatReactors(names: string[]): string`
  - `type FeedItem = FeedPost & { reactions: ReactionSummary[] }`. The page and the feed API now return `FeedItem`s.
  - `toggleReactionAction(postId: string, emojiIndex: number): Promise<{ needsSignIn: true } | { reactions: ReactionSummary[] }>`. It calls `assertReader()` first. With no Google user it returns `{ needsSignIn: true }`.
  - `<ReactionRow postId initial={ReactionSummary[]} signedIn={boolean} />`:
    - It always shows all 5 emoji buttons, with the used ones showing their count, and toggles optimistically.
    - Under the row it shows `<emoji> <formatReactors(names)>` for each used emoji. Tapping a line expands the full list of names.
    - When signed out, a tap calls `authClient.signIn.social({ provider: 'google', callbackURL: '/?post=<id>&react=<index>' })`.
    - `page.tsx`, on seeing `react` together with a signed-in viewer, renders `ReactionRow` with `pendingReact={index}`. The row applies that reaction once, then calls `router.replace('/?post=<id>')`.

- [ ] **Step 1: Write the failing tests**

```ts
// summary.test.ts
test.each([
  [['Mum'], 'Mum'], [['Mum', 'Erik'], 'Mum and Erik'], [['Mum', 'Erik', 'Anna'], 'Mum, Erik and Anna'],
  [['You', 'Mum', 'Erik', 'Anna', 'Lisa'], 'You, Mum and 3 others'], [['Mum', 'Erik', 'Anna', 'Lisa'], 'Mum, Erik and 2 others'],
])('%j → %s', (n, s) => expect(formatReactors(n)).toBe(s));
test('summary: REACTIONS order, first names, viewer as You first, mine flag', () => {
  const rows = [r('👍', 'u1', 'Erik Prytz', 1), r('❤️', 'u2', 'Mum', 2), r('❤️', 'me', 'Vilhelm Prytz', 3)];
  expect(summarizeReactions(rows, 'me')).toEqual([
    { emoji: '❤️', count: 2, names: ['You', 'Mum'], mine: true },
    { emoji: '👍', count: 1, names: ['Erik'], mine: false },
  ]);
});
// repo.test.ts (PGlite; seed a user row + published and draft posts)
test('toggle adds then removes', async () => {
  expect(await toggleReaction(db, { postId, userId, emoji: '❤️' })).toBe('added');
  expect(await toggleReaction(db, { postId, userId, emoji: '❤️' })).toBe('removed');
});
test('draft post → Not found; unknown emoji → Bad emoji', async () => {
  await expect(toggleReaction(db, { postId: draftId, userId, emoji: '❤️' })).rejects.toThrow('Not found');
  await expect(toggleReaction(db, { postId, userId, emoji: '💩' as never })).rejects.toThrow('Bad emoji');
});
```

```ts
// e2e/reactions.spec.ts
test.describe('signed-in reader', () => { test.use({ storageState: 'e2e/.auth/reader.json' });
  test('toggle heart shows "You", survives reload, toggles off', async ({ page }) => {
    await page.goto('/'); const post = page.locator('#post-' + ids.museum);
    await post.getByRole('button', { name: '❤️' }).click(); await expect(post.getByText('❤️ You')).toBeVisible();
    await page.reload(); await expect(post.getByText('❤️ You')).toBeVisible();
    await post.getByRole('button', { name: /❤️/ }).click(); await expect(post.getByText('❤️ You')).toHaveCount(0);
  });
});
test.describe('gated but signed out', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.30' } });
  test('tapping a reaction starts Google sign-in', async ({ page }) => {
    await page.goto('/unlock'); await page.getByLabel('Password').fill('e2e-password'); await page.getByRole('button', { name: 'Open' }).click();
    const post = page.locator('#post-' + ids.museum);
    const req = page.waitForRequest(/\/api\/auth\/sign-in\/social/);
    await post.getByRole('button', { name: '❤️' }).click(); await req;
  });
});
test('server action POST without gate cookie never reaches the action', async ({ request }) => {
  const r = await request.post('/', { headers: { 'next-action': 'x' }, maxRedirects: 0 });
  expect(r.status()).toBe(307); expect(r.headers()['location']).toMatch(/^\/unlock/);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/reactions && npm run test:e2e -- reactions.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Add the table (`npm run db:generate`), repo, summary, action and `ReactionRow`; wire `FeedItem` into the page and the feed API**

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run src/reactions && npm run test:e2e -- reactions.spec.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: emoji reactions with optional Google sign-in"
```

- [ ] **Step 6: Full verification and redeploy**

Run: `npm run lint && npm test && npm run test:e2e && npm run build`. Expected: everything passes.

Then rebuild the Docker image and repeat Task 11's Steps 2–3. Update the README if Task 13 switched to MapTiler, and commit that change.
