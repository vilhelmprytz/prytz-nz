import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { photos, posts } from "./schema";
import { createTestDb } from "./test-db";

test("migrations create tables; deleting a post cascades to its photos", async () => {
  const db = await createTestDb();
  const [p] = await db.insert(posts).values({}).returning();
  expect(p.status).toBe("draft");
  await db.insert(photos).values({
    postId: p.id,
    displayKey: "d",
    thumbKey: "t",
    contentType: "image/webp",
    width: 1,
    height: 1,
    sortOrder: 0,
  });
  await db.delete(posts).where(eq(posts.id, p.id));
  expect(await db.select().from(photos)).toHaveLength(0);
});
