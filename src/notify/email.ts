import type { SubscriberSource } from "./subscribers";

/** What a new-post email says about the post. Every published post has a title and a date. */
export type AnnouncedPost = { id: string; title: string; placeName: string; takenAtLocal: string };

export type NewPostEmailInput = {
  siteUrl: string;
  post: AnnouncedPost;
  recipientName: string;
  /** How they got on the list; decides the footer's "why". */
  source: SubscriberSource;
  unsubscribeToken: string;
};

export type NewPostEmail = {
  subject: string;
  text: string;
  html: string;
  postUrl: string;
  unsubscribeUrl: string;
  oneClickUrl: string;
};

const SITE_NAME = "prytz.nz";

const swedishDate = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** `2026-11-14T23:30:00` → `14 november 2026`. The value is a wall clock, so format it as UTC to avoid any shift. */
function formatSwedishDate(takenAtLocal: string): string {
  return swedishDate.format(new Date(`${takenAtLocal.slice(0, 19)}Z`));
}

function greeting(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ? `Hej ${first}!` : "Hej!";
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The short Swedish "new post, come look" email. No photos: they stay behind the family password. */
export function buildNewPostEmail({
  siteUrl,
  post,
  recipientName,
  source,
  unsubscribeToken,
}: NewPostEmailInput): NewPostEmail {
  const postUrl = new URL(`/?${new URLSearchParams({ post: post.id })}`, siteUrl).toString();
  const unsubscribeQuery = new URLSearchParams({ t: unsubscribeToken });
  const unsubscribeUrl = new URL(`/unsubscribe?${unsubscribeQuery}`, siteUrl).toString();
  const oneClickUrl = new URL(`/unsubscribe/one-click?${unsubscribeQuery}`, siteUrl).toString();

  const hello = greeting(recipientName);
  const date = formatSwedishDate(post.takenAtLocal);
  const place = post.placeName.trim();
  const where = place ? `${place} · ${date}` : date;
  const intro = `Det finns ett nytt inlägg på ${SITE_NAME}:`;
  const why =
    source === "admin"
      ? `Du får det här mejlet eftersom du har bett om att få mejl om nya inlägg på ${SITE_NAME}.`
      : `Du får det här mejlet eftersom du har reagerat på ett inlägg på ${SITE_NAME}.`;
  const stop = "Sluta få de här mejlen";

  const text = [
    hello,
    "",
    intro,
    "",
    post.title,
    where,
    "",
    `Se inlägget: ${postUrl}`,
    "",
    why,
    `${stop}: ${unsubscribeUrl}`,
    "",
  ].join("\n");

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="sv">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(post.title)}</title></head>
<body style="margin:0;padding:24px 16px;background:#f6f3ee;color:#1f1d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;">
<div style="max-width:480px;margin:0 auto;">
<p style="margin:0 0 16px;">${e(hello)}</p>
<p style="margin:0 0 20px;">${e(intro)}</p>
<p style="margin:0;font-size:22px;font-weight:600;line-height:1.3;">${e(post.title)}</p>
<p style="margin:4px 0 24px;color:#6b665e;font-size:14px;">${e(where)}</p>
<p style="margin:0 0 32px;"><a href="${e(postUrl)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#1f1d1a;color:#ffffff;text-decoration:none;font-weight:500;">Se inlägget</a></p>
<p style="margin:0;color:#6b665e;font-size:13px;">${e(why)}<br><a href="${e(unsubscribeUrl)}" style="color:#6b665e;">${e(stop)}</a></p>
</div>
</body>
</html>
`;

  return { subject: `Nytt inlägg: ${post.title}`, text, html, postUrl, unsubscribeUrl, oneClickUrl };
}
