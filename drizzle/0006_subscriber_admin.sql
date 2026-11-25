-- The list can now hold addresses typed by the admin, so user_id stops being the key.
ALTER TABLE "post_email_subscribers" DROP CONSTRAINT "post_email_subscribers_pkey";--> statement-breakpoint
ALTER TABLE "post_email_subscribers" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "post_email_subscribers" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "post_email_subscribers" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "post_email_subscribers" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_email_subscribers" ADD COLUMN "source" text DEFAULT 'reaction' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_email_subscribers" ADD COLUMN "unsubscribed_by" text;--> statement-breakpoint
ALTER TABLE "post_email_subscribers" ADD CONSTRAINT "post_email_subscribers_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "post_email_subscribers" ADD CONSTRAINT "post_email_subscribers_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "post_email_subscribers" ADD CONSTRAINT "post_email_subscribers_user_or_email" CHECK ("user_id" is not null or "email" is not null);--> statement-breakpoint
-- Until now the only way to unsubscribe was yourself.
UPDATE "post_email_subscribers" SET "unsubscribed_by" = 'self' WHERE "unsubscribed_at" IS NOT NULL;
