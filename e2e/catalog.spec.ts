import { expect, test } from "@playwright/test";

test("catalog photos come from our own site, without the per-page security step", async ({ request }) => {
  const res = await request.get("/catalog/w-emerald-satin-midi-dress.jpg");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/jpeg");
  // The proxy adds this header to every page; static photos skip the proxy and its sign-in check.
  expect(res.headers()["content-security-policy"]).toBeUndefined();
});
