ALTER TABLE "photos" ADD COLUMN "kind" text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "video_key" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "video_content_type" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "duration_ms" integer;