import { bigserial, boolean, doublePrecision, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  placeName: text("place_name").notNull().default(""),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  // Wall-clock time at the place the photos were taken; posts sort by this.
  takenAtLocal: timestamp("taken_at_local", { mode: "string" }),
  utcOffset: text("utc_offset"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  headlinePhotoId: uuid("headline_photo_id"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    displayKey: text("display_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    contentType: text("content_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    takenAtLocal: timestamp("taken_at_local", { mode: "string" }),
    utcOffset: text("utc_offset"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    status: text("status", { enum: ["pending", "ready"] }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("photos_post_id_idx").on(t.postId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ipKey: text("ip_key").notNull(),
    success: boolean("success").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_ip_key_attempted_at_idx").on(t.ipKey, t.attemptedAt)],
);

export * from "./auth-schema";
