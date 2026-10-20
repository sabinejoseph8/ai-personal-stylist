import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** The automatic accessibility check (tech spec 8): no serious or critical problems on the page. */
export async function noSeriousA11yProblems(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
