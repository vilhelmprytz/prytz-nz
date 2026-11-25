import { expect, test } from "vitest";
import { buildNewPostEmail } from "./email";

const token = "a".repeat(64);
const base = {
  siteUrl: "https://prytz.nz",
  post: { id: "p1", title: "Milford Sound", placeName: "Fiordland, New Zealand", takenAtLocal: "2026-11-14T10:00:00" },
  recipientName: "Anna Svensson",
  source: "reaction" as const,
  unsubscribeToken: token,
};

test("subject and plain text, exactly", () => {
  const email = buildNewPostEmail(base);
  expect(email.subject).toBe("Nytt inlägg: Milford Sound");
  expect(email.text).toBe(
    [
      "Hej Anna!",
      "",
      "Det finns ett nytt inlägg på prytz.nz:",
      "",
      "Milford Sound",
      "Fiordland, New Zealand · 14 november 2026",
      "",
      "Se inlägget: https://prytz.nz/?post=p1",
      "",
      "Du får det här mejlet eftersom du har reagerat på ett inlägg på prytz.nz.",
      `Sluta få de här mejlen: https://prytz.nz/unsubscribe?t=${token}`,
      "",
    ].join("\n"),
  );
  expect(email.postUrl).toBe("https://prytz.nz/?post=p1");
  expect(email.unsubscribeUrl).toBe(`https://prytz.nz/unsubscribe?t=${token}`);
  expect(email.oneClickUrl).toBe(`https://prytz.nz/unsubscribe/one-click?t=${token}`);
});

test("no place name → the line is only the date", () => {
  const email = buildNewPostEmail({ ...base, post: { ...base.post, placeName: "  " } });
  expect(email.text.split("\n")).toContain("14 november 2026");
  expect(email.text).not.toContain("·");
  expect(email.html).not.toContain("·");
});

test.each([
  ["", "Hej!"],
  ["   ", "Hej!"],
  ["  Åsa  Prytz ", "Hej Åsa!"],
])("greeting for %j", (name, greeting) => {
  const email = buildNewPostEmail({ ...base, recipientName: name });
  expect(email.text.split("\n")[0]).toBe(greeting);
  expect(email.html).toContain(greeting);
});

test("late evening stays on the same day", () => {
  const email = buildNewPostEmail({ ...base, post: { ...base.post, takenAtLocal: "2026-11-14T23:30:00" } });
  expect(email.text).toContain("Fiordland, New Zealand · 14 november 2026");
});

test("trailing slash on siteUrl", () => {
  const email = buildNewPostEmail({ ...base, siteUrl: "https://prytz.nz/" });
  expect(email.postUrl).toBe("https://prytz.nz/?post=p1");
  expect(email.unsubscribeUrl).toBe(`https://prytz.nz/unsubscribe?t=${token}`);
});

test("html escapes title, place and name and links both URLs", () => {
  const email = buildNewPostEmail({
    ...base,
    post: { ...base.post, title: `<b>Tom & "Jerry"</b>`, placeName: "<i>x</i>" },
    recipientName: "<script>",
  });
  expect(email.html).toContain("&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;");
  expect(email.html).toContain("&lt;i&gt;x&lt;/i&gt;");
  expect(email.html).not.toContain("<b>Tom");
  expect(email.html).not.toContain("<i>x");
  expect(email.html).not.toContain("<script>");
  expect(email.html).toContain(`href="https://prytz.nz/?post=p1"`);
  expect(email.html).toContain(`href="https://prytz.nz/unsubscribe?t=${token}"`);
  expect(email.html).toContain("Se inlägget");
  expect(email.html).toContain("Sluta få de här mejlen");
  expect(email.html).toContain('lang="sv"');
  expect(email.subject).toBe(`Nytt inlägg: <b>Tom & "Jerry"</b>`);
});

test("a person the admin added gets the 'bett om' footer", () => {
  const email = buildNewPostEmail({ ...base, source: "admin" });
  const why = "Du får det här mejlet eftersom du har bett om att få mejl om nya inlägg på prytz.nz.";
  expect(email.text.split("\n")).toContain(why);
  expect(email.text).not.toContain("reagerat");
  expect(email.html).toContain(why);
  expect(email.html).not.toContain("reagerat");
});
