import { expect, test } from "@playwright/test";
import { E2E_BASE_URL, READER_STATE } from "./env";
import { seedIds } from "./seed";

// Layout-only guards still stream the page's data in the redirect body; nothing may leak.
test("admin pages leak no post data to visitors or non-admin readers", async ({ playwright }) => {
  const ids = seedIds();
  const anonymous = await playwright.request.newContext({ baseURL: E2E_BASE_URL });
  const reader = await playwright.request.newContext({ baseURL: E2E_BASE_URL, storageState: READER_STATE });
  for (const ctx of [anonymous, reader]) {
    for (const path of ["/admin", `/admin/posts/${ids.draft}`]) {
      for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
        const res = await ctx.get(path, { headers, maxRedirects: 0 });
        const body = await res.text();
        expect(body, `${path} ${JSON.stringify(headers)}`).not.toContain("Secret draft");
      }
    }
  }
  await anonymous.dispose();
  await reader.dispose();
});
