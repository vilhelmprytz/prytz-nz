import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { getEnv } from "@/env";

function createAuth() {
  const env = getEnv();
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },
    // Test-only login for e2e. It can never grant admin: admin requires a verified email.
    emailAndPassword: { enabled: env.E2E_TEST_AUTH },
    // Match the family-password cookie so reactions don't need a new sign-in mid-trip.
    session: { expiresIn: 180 * 24 * 3600 },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Created on first use so `next build` never needs runtime secrets. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
