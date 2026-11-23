import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, test } from "vitest";
import { postEmailSubscribers, user } from "./schema";
import { createTestDb, migrationsBefore, migrationsFolder } from "./test-db";

const TOKEN = /^[0-9a-f]{64}$/;

test("existing reactors join the list; once-published posts count as announced", async () => {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: await migrationsBefore("0005_") });
  await client.exec(`
    insert into "user" (id, name, email) values ('u1', 'One', 'u1@example.com'), ('u2', 'Two', 'u2@example.com'), ('u3', 'Three', 'u3@example.com');
    insert into posts (id, title, status, published_at) values
      ('11111111-1111-1111-1111-111111111111', 'pub', 'published', '2026-10-01T00:00:00Z'),
      ('22222222-2222-2222-2222-222222222222', 'was', 'draft', '2026-10-02T00:00:00Z'),
      ('33333333-3333-3333-3333-333333333333', 'dr', 'draft', null);
    insert into reactions (post_id, user_id, emoji) values
      ('11111111-1111-1111-1111-111111111111', 'u1', '❤️'),
      ('11111111-1111-1111-1111-111111111111', 'u1', '👍'),
      ('11111111-1111-1111-1111-111111111111', 'u2', '😂');
  `);

  await migrate(db, { migrationsFolder });

  const subs = (
    await client.query<{ user_id: string; unsubscribe_token: string; unsubscribed_at: string | null }>(
      "select user_id, unsubscribe_token, unsubscribed_at from post_email_subscribers order by user_id",
    )
  ).rows;
  expect(subs.map((r) => r.user_id)).toEqual(["u1", "u2"]);
  for (const r of subs) {
    expect(r.unsubscribe_token).toMatch(TOKEN);
    expect(r.unsubscribed_at).toBeNull();
  }
  expect(subs[0].unsubscribe_token).not.toBe(subs[1].unsubscribe_token);

  const announced = (
    await client.query<{ title: string; same: boolean | null }>(
      "select title, announced_at = published_at as same, announced_at is null as unset from posts order by title",
    )
  ).rows;
  expect(announced).toEqual([
    { title: "dr", same: null, unset: true },
    { title: "pub", same: true, unset: false },
    { title: "was", same: true, unset: false },
  ]);
});

test("a new subscriber gets a token by default", async () => {
  const db = await createTestDb();
  await db.insert(user).values({ id: "u1", name: "One", email: "u1@example.com" });
  await db.insert(postEmailSubscribers).values({ userId: "u1" });
  const [row] = await db.select().from(postEmailSubscribers);
  expect(row.unsubscribeToken).toMatch(TOKEN);
  expect(row.unsubscribedAt).toBeNull();
});
