import type { ByteRange } from "@/photos/range";

/** `size` is always the whole object's size; `range` says which bytes `body` holds when one was asked for. */
export type StoredObject = { body: ReadableStream<Uint8Array>; size: number; contentType: string; range?: ByteRange };

export interface Storage {
  /** A URL the browser can PUT the object to, valid for 15 minutes. */
  presignPut(key: string, contentType: string): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  get(key: string, range?: ByteRange): Promise<StoredObject | null>;
  delete(keys: string[]): Promise<void>;
}
