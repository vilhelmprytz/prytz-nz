import "server-only";
import { getEnv } from "@/env";
import { createFsStorage } from "./fs";
import { createS3Storage } from "./s3";
import type { Storage } from "./types";

export type { Storage, StoredObject } from "./types";

let instance: Storage | undefined;

export function getStorage(): Storage {
  if (instance) return instance;
  const env = getEnv();
  instance =
    env.STORAGE_DRIVER === "fs"
      ? createFsStorage(env.FS_STORAGE_DIR)
      : createS3Storage({
          endpoint: env.S3_ENDPOINT!,
          bucket: env.S3_BUCKET!,
          accessKeyId: env.S3_ACCESS_KEY_ID!,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        });
  return instance;
}
