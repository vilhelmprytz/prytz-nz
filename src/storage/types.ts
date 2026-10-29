export type StoredObject = { body: ReadableStream<Uint8Array>; size: number; contentType: string };

export interface Storage {
  /** A URL the browser can PUT the object to, valid for 15 minutes. */
  presignPut(key: string, contentType: string): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  get(key: string): Promise<StoredObject | null>;
  delete(keys: string[]): Promise<void>;
}
