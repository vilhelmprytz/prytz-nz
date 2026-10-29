declare module "piexifjs" {
  const piexif: {
    dump(exif: Record<string, Record<number, unknown>>): string;
    insert(exifBytes: string, jpegBinary: string): string;
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
    GPSHelper: { degToDmsRational(deg: number): number[][] };
  };
  export default piexif;
}
