import { expect, test } from "@playwright/test";

// 1b: every page carries the browser protections, and the strict policy doesn't break it.
test("the home page has the security headers and no blocked scripts", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) blocked.push(m.text());
  });
  const res = await page.goto("/");
  const headers = res!.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  await expect(page.getByRole("button", { name: "Try the demo" })).toBeVisible();
  expect(blocked).toEqual([]);
});

test("a visitor isn't a guest until they tap Try the demo", async ({ request }) => {
  const res = await request.get("/api/guest");
  expect(await res.json()).toEqual({ guest: false });
});

test("Try the demo refuses a missing bot check", async ({ request }) => {
  const res = await request.post("/api/guest", { data: {} });
  expect(res.status()).toBe(400);
});
