export type ResizedImage = { blob: Blob; width: number; height: number; contentType: "image/webp" | "image/jpeg" };

/** Downscales (never upscales) in the browser, respecting EXIF orientation. WebP, falling back to JPEG. */
export async function resizeImage(file: Blob, maxEdge: number, quality: number): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  // The default "low" smoothing visibly aliases big downscales (2560 → 640 thumbnails).
  const draw = (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) => {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
  };

  const encode = async (type: string): Promise<Blob> => {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      draw(canvas.getContext("2d")!);
      return canvas.convertToBlob({ type, quality });
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d")!);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, quality),
    );
  };

  try {
    let blob = await encode("image/webp");
    // Browsers without a WebP encoder silently return PNG.
    if (blob.type !== "image/webp") blob = await encode("image/jpeg");
    return { blob, width, height, contentType: blob.type === "image/webp" ? "image/webp" : "image/jpeg" };
  } finally {
    bitmap.close();
  }
}
