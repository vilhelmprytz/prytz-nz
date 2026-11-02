import { z } from "zod";

const nullableNumber = (min: number, max: number) => z.number().min(min).max(max).nullable();

const common = {
  // For a clip, the poster images' type.
  contentType: z.enum(["image/webp", "image/jpeg"]),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
  takenAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/).nullable(),
  utcOffset: z.string().regex(/^[+-]\d{2}:\d{2}$/).nullable(),
  lat: nullableNumber(-90, 90),
  lng: nullableNumber(-180, 180),
};

const photoMeta = z.object({ ...common, kind: z.literal("photo").default("photo") });
const clipMeta = z.object({
  ...common,
  kind: z.literal("video"),
  durationMs: z.number().int().positive().max(120_000),
  videoContentType: z.literal("video/mp4"),
});

/** Body of POST /api/admin/uploads: register a photo or a clip and get its upload links. */
export const uploadRequestSchema = z.object({
  postId: z.uuid(),
  meta: z.union([photoMeta, clipMeta]),
});
