export type RouteClass = "public" | "self-guarded" | "reader";

// Reachable without the family password. /unsubscribe shows no journal content; its token is the only key.
// The app icons show on the password page and in mail clients that fetch the sender's icon (/favicon.ico skips the proxy).
const PUBLIC = ["/unlock", "/api/auth", "/robots.txt", "/unsubscribe", "/icon.svg", "/apple-icon.png"];
// Each route checks the admin session itself.
const SELF_GUARDED = ["/admin", "/api/admin", "/api/dev-storage"];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function classifyPath(pathname: string): RouteClass {
  if (PUBLIC.some((p) => under(pathname, p))) return "public";
  if (SELF_GUARDED.some((p) => under(pathname, p))) return "self-guarded";
  return "reader";
}

/** Only same-site relative paths; anything that could leave the site falls back to "/". */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  // URL parsing drops tabs/newlines, so "/\t/evil.com" would become "//evil.com".
  if (/[\u0000-\u0020\u007f]/.test(next)) return "/";
  const resolved = new URL(next, "http://same.site");
  return resolved.host === "same.site" ? next : "/";
}

/** Admin pages (everything under /admin except the login page) need an admin session before anything renders. */
export function isAdminPagePath(pathname: string): boolean {
  return under(pathname, "/admin") && !under(pathname, "/admin/login");
}
