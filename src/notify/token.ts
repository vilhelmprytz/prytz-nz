const TOKEN = /^[0-9a-f]{64}$/;

/** A query value is a token only if it's a single string in the exact stored format; anything else is a bad link. */
export function parseUnsubscribeToken(value: string | string[] | null | undefined): string | null {
  return typeof value === "string" && TOKEN.test(value) ? value : null;
}
