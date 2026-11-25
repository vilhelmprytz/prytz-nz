import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  placeName: text("place_name").notNull().default(""),
  // Wall-clock time at the place the photos were taken; posts sort by this.
  takenAtLocal: timestamp("taken_at_local", { mode: "string" }),
  utcOffset: text("utc_offset"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  headlinePhotoId: uuid("headline_photo_id"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  // Set once, when the new-post email goes out (or would have, before emails existed). Never cleared.
  announcedAt: timestamp("announced_at", { withTimezone: true }),
});

/** A post's places in travel order: one for most posts, several for a travel day (ARN → LHR → LAX). */
export const postPoints = pgTable(
  "post_points",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.position] })],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    displayKey: text("display_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    kind: text("kind", { enum: ["photo", "video"] }).notNull().default("photo"),
    contentType: text("content_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    takenAtLocal: timestamp("taken_at_local", { mode: "string" }),
    utcOffset: text("utc_offset"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    status: text("status", { enum: ["pending", "ready"] }).notNull().default("pending"),
    // Clips only: the compressed MP4. The poster frame uses display_key/thumb_key like a photo.
    videoKey: text("video_key"),
    videoContentType: text("video_content_type"),
    durationMs: integer("duration_ms"),
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

export const reactions = pgTable(
  "reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId, t.emoji] })],
);

/**
 * Who gets new-post emails: anyone who has reacted, the admin, and addresses the admin added by hand. Each row is a
 * sign-in (`user_id`), a typed address (`email`), or both once that person signs in. Nobody is ever deleted;
 * unsubscribing (themselves or by the admin) takes them off.
 */
export const postEmailSubscribers = pgTable(
  "post_email_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    // Typed by the admin, trimmed and lowercased.
    email: text("email").unique(),
    // Typed by the admin; wins over the account's name for the greeting.
    name: text("name").notNull().default(""),
    source: text("source", { enum: ["reaction", "admin"] }).notNull().default("reaction"),
    // 64 hex characters from two random UUIDs (about 244 random bits). Never expires.
    unsubscribeToken: text("unsubscribe_token")
      .notNull()
      .unique()
      .default(sql`replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')`),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }).notNull().defaultNow(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    // Null while subscribed; also null for rows unsubscribed by older code, which shows as "themselves".
    unsubscribedBy: text("unsubscribed_by", { enum: ["self", "admin"] }),
  },
  (t) => [check("post_email_subscribers_user_or_email", sql`"user_id" is not null or "email" is not null`)],
);

export * from "./auth-schema";
