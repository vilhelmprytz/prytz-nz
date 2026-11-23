CREATE TABLE "post_email_subscribers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"unsubscribe_token" text DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "post_email_subscribers_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "announced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_email_subscribers" ADD CONSTRAINT "post_email_subscribers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Everyone who has reacted so far is on the list, each with their own token.
INSERT INTO "post_email_subscribers" ("user_id") SELECT DISTINCT "user_id" FROM "reactions";--> statement-breakpoint
-- Posts published before emails existed (including ones unpublished since) never send.
UPDATE "posts" SET "announced_at" = "published_at" WHERE "published_at" IS NOT NULL;
