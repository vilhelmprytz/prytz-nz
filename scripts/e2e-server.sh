#!/usr/bin/env bash
# Builds the production standalone server (the same artifact the Dockerfile ships) and runs it for e2e tests.
set -euo pipefail
cd "$(dirname "$0")/.."
npx next build
rm -rf .next/standalone/.next/static .next/standalone/public .next/standalone/drizzle
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public
cp -R drizzle .next/standalone/drizzle
cd .next/standalone
exec node server.js
