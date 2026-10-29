import { beforeEach, expect, test, vi } from "vitest";
import { UploadFailedError, uploadWithRetry } from "./upload";

const sleep = vi.fn(async (_ms: number) => {});

beforeEach(() => {
  sleep.mockClear();
});

test("retries 5xx then succeeds", async () => {
  const put = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  await uploadWithRetry(put, { sleep });
  expect(put).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledWith(1000);
});

test("network errors retried with backoff, gives up after 4", async () => {
  const put = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(uploadWithRetry(put, { sleep })).rejects.toBeInstanceOf(UploadFailedError);
  expect(put).toHaveBeenCalledTimes(4);
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000]);
});

test("4xx is not retried", async () => {
  const put = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
  await expect(uploadWithRetry(put, { sleep })).rejects.toThrow();
  expect(put).toHaveBeenCalledTimes(1);
});
