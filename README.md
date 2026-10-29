# prytz.nz

A private, photo-first travel journal for family and friends. Readers enter one shared family password; the admin posts from a phone after signing in with Google. Posts show up in a feed next to a satellite map of the route.

- **Next.js 16** (App Router, standalone output), one container on **Dokploy**
- **PostgreSQL** via Drizzle (migrations run automatically on startup)
- **Better Auth** with Google sign-in (admin, plus readers who want to react)
- **Cloudflare R2** for photos (private bucket; every photo is served through the app)

Design and plan: [`docs/superpowers/specs`](docs/superpowers/specs) and [`docs/superpowers/plans`](docs/superpowers/plans).

## Local development

```bash
docker compose -f docker-compose.dev.yml up -d db   # Postgres on localhost:5433 (dbs: prytz, prytz_e2e)
cp .env.example .env.local                          # then fill it in (see below)
npm install
npm run dev                                         # http://localhost:3000
```

For local work, set `STORAGE_DRIVER=fs` in `.env.local`: photos are stored in `.storage/` and no R2 account is needed. Google sign-in works locally once the OAuth client below lists the localhost redirect URI.

Tests:

```bash
npm test            # unit + database tests (Vitest, in-memory PGlite)
npm run test:e2e    # browser tests (Playwright) against a production build; needs the compose db running
npm run lint
```

The e2e suite builds the standalone server, resets the `prytz_e2e` database, and uses a test-only email/password login (`E2E_TEST_AUTH=1`) so it never needs Google.

## Google OAuth client

In Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** of type *Web application*:

- Authorized JavaScript origins: `https://prytz.nz`, `http://localhost:3000`
- Authorized redirect URIs:
  - `https://prytz.nz/api/auth/callback/google`
  - `http://localhost:3000/api/auth/callback/google`

Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Only the account in `ADMIN_EMAIL` can post; anyone else who signs in can only react.

## Cloudflare R2

1. Create a bucket (for example `prytz-nz-photos`). Leave **public access off** and don't enable the `r2.dev` URL.
2. Create an **R2 API token** scoped to that bucket with **Object Read & Write**. Copy the access key ID and secret.
3. Set:
   - `STORAGE_DRIVER=s3`
   - `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
4. Add a CORS policy to the bucket (Settings → CORS) so the phone can upload straight to R2:

```json
[
  {
    "AllowedOrigins": ["https://prytz.nz", "http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

## Deploying on Dokploy

1. **Database:** create a PostgreSQL service. Copy its internal connection URL into `DATABASE_URL`.
2. **Backups:** under the database's Backups tab, add an S3 destination (R2 works: same endpoint, a separate bucket or prefix) and schedule daily backups.
3. **Application:** create an application from this repository, build type **Dockerfile**. Add the domain `prytz.nz` with HTTPS (Let's Encrypt) on container port `3000`.
4. **Environment:** set every variable from [`.env.example`](.env.example):
   - `BETTER_AUTH_URL=https://prytz.nz`
   - `BETTER_AUTH_SECRET`: at least 32 random characters (`openssl rand -base64 48`)
   - `FAMILY_PASSWORD`: the password you give family and friends
   - `ADMIN_EMAIL=vilhelm@prytznet.se`
   - Never set `E2E_TEST_AUTH` in production.
5. Deploy. Migrations run when the container starts.

### DNS

Point `prytz.nz` (an `A` record, plus `AAAA` if the server has IPv6) at the Dokploy host.

### First-deploy checks

- **Visitor IP:** from your phone (on mobile data, not the server's network), enter a wrong password once. The application logs should show a line like `[unlock] ip=<your phone's public IP> key=...`. If it shows a Docker or Traefik address instead, everyone would share one rate-limit bucket: adjust `TRUSTED_PROXY_HOPS` (the number of proxies in front of the app that append to `X-Forwarded-For`; `1` for plain Dokploy/Traefik) and check again.
- **Photo location on Android:** create a test post from your phone. If the Location section says `From photo GPS`, the phone keeps location data on upload. If it never does, the browser's photo picker is stripping it: use `Use my current location` while you're at the place, or drop a pin.

## Day-to-day

- **Posting:** go to `https://prytz.nz/admin`, sign in with Google, tap **New post**, add photos. Date and location fill in from the photos; drafts autosave; **Publish** when ready. You can backfill older stops: posts are ordered by when the photos were taken.
- **Changing the family password:** update `FAMILY_PASSWORD` and redeploy. This signs every reader out; they enter the new password once.
- **Unfinished uploads** (photos uploaded but never attached) are cleaned up automatically at startup after 24 hours.
