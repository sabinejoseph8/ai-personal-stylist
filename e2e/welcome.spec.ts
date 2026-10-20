import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Phase 1 starts with the placeholder page; the real welcome screen arrives in 1d.
test("the home page loads and says nothing is for sale", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI Personal Stylist" })).toBeVisible();
  await expect(page.getByText("Nothing here is for sale.")).toBeVisible();
});

test("the home page has no serious accessibility problems", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => v.id)).toEqual([]);
});
