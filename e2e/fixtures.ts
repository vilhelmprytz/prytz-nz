import path from "node:path";
import type { Page } from "@playwright/test";
import piexif from "piexifjs";

/** A real 400×300 JPEG (a screenshot) with the given EXIF written into it. */
export async function makeJpeg(
  page: Page,
  opts: { gps?: [number, number]; date?: string; orientation?: number },
): Promise<Buffer> {
  const scratch = await page.context().newPage();
  await scratch.setContent(
    '<div id="box" style="width:400px;height:300px;background:linear-gradient(135deg,#3d6b8f,#9cc3d9)"></div>',
  );
  const jpeg = await scratch.locator("#box").screenshot({ type: "jpeg", quality: 80 });
  await scratch.close();

  const exif: Record<string, Record<number, unknown>> = { "0th": {}, Exif: {}, GPS: {} };
  if (opts.orientation) exif["0th"][piexif.ImageIFD.Orientation] = opts.orientation;
  if (opts.date) exif.Exif[piexif.ExifIFD.DateTimeOriginal] = opts.date;
  if (opts.gps) {
    const [lat, lng] = opts.gps;
    exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = lat < 0 ? "S" : "N";
    exif.GPS[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lat));
    exif.GPS[piexif.GPSIFD.GPSLongitudeRef] = lng < 0 ? "W" : "E";
    exif.GPS[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lng));
  }
  return Buffer.from(piexif.insert(piexif.dump(exif), jpeg.toString("binary")), "binary");
}

const MEDIABUNNY = path.join(process.cwd(), "node_modules/mediabunny/dist/bundles/mediabunny.min.mjs");

/** A real H.264 MP4 (no audio): coloured frames at 30 fps, encoded in the browser with the app's own Mediabunny. */
export async function makeClip(page: Page, opts: { seconds: number; width: number; height: number }): Promise<Buffer> {
  const scratch = await page.context().newPage();
  await scratch.route("**/__fixtures/mediabunny.mjs", (route) =>
    route.fulfill({ path: MEDIABUNNY, contentType: "text/javascript" }),
  );
  // Same origin as the app, so the module import needs no CORS; the route answers before the gate sees it.
  await scratch.goto("/robots.txt");
  // A string, so the test transpiler can't rewrite the browser-side import().
  const b64: string = await scratch.evaluate(`(async () => {
    const { seconds, width, height } = ${JSON.stringify(opts)};
    const mb = await import("/__fixtures/mediabunny.mjs");
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const source = new mb.CanvasSource(canvas, { codec: "avc", bitrate: 1_000_000 });
    output.addVideoTrack(source, { frameRate: 30 });
    await output.start();
    for (let i = 0; i < seconds * 30; i++) {
      ctx.fillStyle = "hsl(" + ((i * 6) % 360) + ", 70%, 50%)";
      ctx.fillRect(0, 0, width, height);
      await source.add(i / 30, 1 / 30);
    }
    await output.finalize();
    const bytes = new Uint8Array(target.buffer);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  })()`);
  await scratch.close();
  return Buffer.from(b64, "base64");
}
