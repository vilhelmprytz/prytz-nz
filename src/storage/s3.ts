import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Storage } from "./types";

/** Cloudflare R2 through its S3-compatible API. The bucket stays private; the app serves every photo. */
export function createS3Storage(cfg: {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Storage {
  const client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // Default checksums add signed headers a browser PUT can't send, which R2 then rejects.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = cfg.bucket;
  const isMissing = (e: unknown) => e instanceof NotFound || e instanceof NoSuchKey;

  return {
    presignPut(key, contentType) {
      return getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), {
        expiresIn: 15 * 60,
      });
    },
    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "application/octet-stream" };
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        if (!res.Body) return null;
        return {
          body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
          size: res.ContentLength ?? 0,
          contentType: res.ContentType ?? "application/octet-stream",
        };
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
    async delete(keys) {
      if (keys.length === 0) return;
      await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
    },
  };
}
