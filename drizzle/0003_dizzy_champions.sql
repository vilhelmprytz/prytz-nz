CREATE TABLE "post_points" (
	"post_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	CONSTRAINT "post_points_post_id_position_pk" PRIMARY KEY("post_id","position")
);
--> statement-breakpoint
ALTER TABLE "post_points" ADD CONSTRAINT "post_points_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Carry every existing post's single location over as its first point before the old columns go.
INSERT INTO "post_points" ("post_id", "position", "lat", "lng")
SELECT "id", 0, "lat", "lng" FROM "posts" WHERE "lat" IS NOT NULL AND "lng" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "lat";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "lng";