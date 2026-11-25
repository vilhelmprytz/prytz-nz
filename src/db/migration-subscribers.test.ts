import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, expect, test } from "vitest";
import { migrationsBefore, migrationsFolder } from "./test-db";

const TOKEN = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Row = {
  id: string;
  user_id: string | null;
  email: string | null;
  name: string;
  source: string;
  unsubscribe_token: string;
  subscribed_at: Date;
  unsubscribed_at: Date | null;
  unsubscribed_by: string | null;
};

let client: PGlite;

beforeEach(async () => {
  client = new PGlite();
  await migrate(drizzle(client), { migrationsFolder: await migrationsBefore("0006_") });
  await client.exec(`
    insert into "user" (id, name, email) values ('u1', 'One', 'u1@example.com'), ('u2', 'Two', 'u2@example.com'), ('u3', 'Three', 'u3@example.com');
    insert into post_email_subscribers (user_id, unsubscribe_token, subscribed_at, unsubscribed_at) values
      ('u1', '${"a".repeat(64)}', '2026-11-01T00:00:00Z', null),
      ('u2', '${"b".repeat(64)}', '2026-11-02T00:00:00Z', '2026-11-10T00:00:00Z');
  `);
  await migrate(drizzle(client), { migrationsFolder });
});

const rows = async () => (await client.query<Row>("select * from post_email_subscribers order by user_id")).rows;

test("existing rows keep token, dates and state; source and unsubscribed_by are filled in", async () => {
  const [u1, u2] = await rows();
  expect(u1).toMatchObject({
    user_id: "u1",
    email: null,
    name: "",
    source: "reaction",
    unsubscribe_token: "a".repeat(64),
    subscribed_at: new Date("2026-11-01T00:00:00Z"),
    unsubscribed_at: null,
    unsubscribed_by: null,
  });
  expect(u2).toMatchObject({
    user_id: "u2",
    source: "reaction",
    unsubscribe_token: "b".repeat(64),
    unsubscribed_at: new Date("2026-11-10T00:00:00Z"),
    unsubscribed_by: "self",
  });
  expect(u1.id).toMatch(UUID);
  expect(u2.id).toMatch(UUID);
  expect(u1.id).not.toBe(u2.id);
});

test("an insert of only user_id still works (old code during a deploy)", async () => {
  await client.exec("insert into post_email_subscribers (user_id) values ('u3') on conflict do nothing");
  await client.exec("insert into post_email_subscribers (user_id) values ('u3') on conflict do nothing");
  const u3 = (await rows()).filter((r) => r.user_id === "u3");
  expect(u3).toHaveLength(1);
  expect(u3[0].unsubscribe_token).toMatch(TOKEN);
  expect(u3[0].source).toBe("reaction");
});

test("a typed address needs no user; a row needs one or the other; both are unique", async () => {
  await client.exec("insert into post_email_subscribers (email, source) values ('anna@example.se', 'admin')");
  const anna = (await rows()).find((r) => r.email === "anna@example.se");
  expect(anna).toMatchObject({ user_id: null, source: "admin", name: "" });
  expect(anna?.unsubscribe_token).toMatch(TOKEN);

  await expect(client.exec("insert into post_email_subscribers (name) values ('x')")).rejects.toThrow(/check/i);
  await expect(client.exec("insert into post_email_subscribers (email) values ('anna@example.se')")).rejects.toThrow(
    /unique/i,
  );
  await expect(client.exec("insert into post_email_subscribers (user_id) values ('u1')")).rejects.toThrow(/unique|duplicate/i);
});
