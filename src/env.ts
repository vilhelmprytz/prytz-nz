import "server-only";
import { z } from "zod";

const S3_VARS = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    FAMILY_PASSWORD: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    ADMIN_EMAIL: z.string().email(),
    STORAGE_DRIVER: z.enum(["s3", "fs"]).default("s3"),
    S3_ENDPOINT: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    FS_STORAGE_DIR: z.string().default(".storage"),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
    NOMINATIM_URL: z.string().default("https://nominatim.openstreetmap.org"),
    E2E_TEST_AUTH: z
      .string()
      .optional()
      .transform((v) => v === "1" || v === "true"),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER !== "s3") return;
    for (const key of S3_VARS) {
      if (!env[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
      }
    }
  });

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
