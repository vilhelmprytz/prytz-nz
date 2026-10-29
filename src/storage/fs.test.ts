import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, expect, test } from "vitest";
import { createFsStorage } from "./fs";

let s: ReturnType<typeof createFsStorage>;

beforeEach(async () => {
  s = createFsStorage(await mkdtemp(path.join(tmpdir(), "pz-fs-")));
});

test("put/head/get/delete round trip; missing → null", async () => {
  await s.put("a/b.webp", new Uint8Array([1, 2, 3]), "image/webp");
  expect(await s.head("a/b.webp")).toEqual({ size: 3, contentType: "image/webp" });
  const obj = await s.get("a/b.webp");
  expect(obj?.contentType).toBe("image/webp");
  expect(new Uint8Array(await new Response(obj!.body).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  await s.delete(["a/b.webp"]);
  expect(await s.head("a/b.webp")).toBeNull();
  expect(await s.get("a/b.webp")).toBeNull();
});

test("rejects keys escaping the dir", async () => {
  await expect(s.put("../x", new Uint8Array(1), "image/webp")).rejects.toThrow();
});

test("presignPut points at the dev upload route", async () => {
  expect(await s.presignPut("photos/1/display.webp", "image/webp")).toBe("/api/dev-storage/photos/1/display.webp");
});
