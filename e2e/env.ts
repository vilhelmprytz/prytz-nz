import path from "node:path";

// Environment for the e2e server and global setup.
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export const E2E_ENV: Record<string, string> = {
  DATABASE_URL: "postgres://postgres:dev@localhost:5433/prytz_e2e",
  STORAGE_DRIVER: "fs",
  // Absolute: the standalone server runs from .next/standalone.
  FS_STORAGE_DIR: path.join(process.cwd(), ".storage-e2e"),
  FAMILY_PASSWORD: "e2e-password",
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
  BETTER_AUTH_URL: E2E_BASE_URL,
  GOOGLE_CLIENT_ID: "e2e-google-client",
  GOOGLE_CLIENT_SECRET: "e2e-google-secret",
  ADMIN_EMAIL: "admin@e2e.test",
  E2E_TEST_AUTH: "1",
  NOMINATIM_URL: "",
  TRUSTED_PROXY_HOPS: "1",
  PORT: String(E2E_PORT),
  HOSTNAME: "localhost",
};

export const ADMIN_STATE = "e2e/.auth/admin.json";
export const READER_STATE = "e2e/.auth/reader.json";
