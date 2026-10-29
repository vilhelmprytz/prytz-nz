import { afterEach, expect, test, vi } from "vitest";
import { resizeImage } from "./resize";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("downscales with high-quality smoothing, keeping the aspect ratio", async () => {
  let qualityAtDraw: string | undefined;
  const ctx = {
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
    drawImage: vi.fn(() => {
      qualityAtDraw = ctx.imageSmoothingQuality;
    }),
  };
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return ctx;
      }
      async convertToBlob({ type }: { type: string }) {
        return new Blob([], { type });
      }
    },
  );

  const out = await resizeImage(new Blob(), 640, 0.8);
  expect(qualityAtDraw).toBe("high");
  expect([out.width, out.height]).toEqual([640, 480]);
  expect(out.contentType).toBe("image/webp");
});
