import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// 1c: the design system page has no serious accessibility problems, dialogs handle the
// keyboard properly, and reduced motion turns animation off.
test("the design system page has no serious accessibility problems", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByRole("heading", { name: "AI Personal Stylist" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test("the fonts load from our own site under the security policy", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) blocked.push(m.text());
  });
  await page.goto("/design-system");
  await page.evaluate(() => document.fonts.ready);
  const families = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
  expect(families.join(" ")).toMatch(/Newsreader/);
  expect(families.join(" ")).toMatch(/Figtree/);
  expect(blocked).toEqual([]);
});

test("a confirm dialog traps focus and returns it", async ({ page }) => {
  await page.goto("/design-system");
  // The second "Delete all data" button is the one that opens the dialog.
  const opener = page.getByRole("button", { name: "Delete all data" }).nth(1);
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Delete all your data?" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("buttons are at least 44 px tall", async ({ page }) => {
  await page.goto("/design-system");
  const heights = await page.getByRole("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("the sheet appears without sliding", async ({ page }) => {
    await page.goto("/design-system");
    await page.getByRole("button", { name: "Open a sheet" }).click();
    const sheet = page.getByRole("dialog", { name: "Behind the scenes" });
    await expect(sheet).toBeVisible();
    const duration = await sheet.evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    expect(duration).toBeLessThan(0.01);
  });
});
