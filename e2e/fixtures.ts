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
