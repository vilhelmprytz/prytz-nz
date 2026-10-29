import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { Storage } from "./types";

/** Local-folder storage for development and e2e. Uploads go through /api/dev-storage. */
export function createFsStorage(dir: string): Storage & {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
} {
  const root = path.resolve(dir);
  const fileFor = (key: string) => {
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return file;
  };
  const metaFor = (file: string) => `${file}.meta.json`;

  async function head(key: string) {
    const file = fileFor(key);
    try {
      const [info, meta] = await Promise.all([stat(file), readFile(metaFor(file), "utf8")]);
      return { size: info.size, contentType: (JSON.parse(meta) as { contentType: string }).contentType };
    } catch {
      return null;
    }
  }

  return {
    async presignPut(key) {
      fileFor(key);
      return `/api/dev-storage/${key}`;
    },
    head,
    async get(key) {
      const info = await head(key);
      if (!info) return null;
      const body = Readable.toWeb(createReadStream(fileFor(key))) as ReadableStream<Uint8Array>;
      return { body, ...info };
    },
    async delete(keys) {
      await Promise.all(keys.flatMap((k) => [rm(fileFor(k), { force: true }), rm(metaFor(fileFor(k)), { force: true })]));
    },
    async put(key, bytes, contentType) {
      const file = fileFor(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
      await writeFile(metaFor(file), JSON.stringify({ contentType }));
    },
  };
}
