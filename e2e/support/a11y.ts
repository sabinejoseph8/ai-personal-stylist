import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** The automatic accessibility check (tech spec 8): no serious or critical problems on the page. */
export async function noSeriousA11yProblems(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/**
 * Touch targets (R69, design 3: at least 44 by 44 px): every visible button, link and field, apart from a
 * link inside a sentence, visually hidden file inputs, and the notebook's notes and photo details, which
 * stay one 28 px ruled line tall, full width (Sabine's answer A in 7a: the one exception to R69). Returns
 * the ones too small, for the test to show.
 */
export async function smallTouchTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("a[href], button, input:not([type=file]), select, textarea, [role=button], summary")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden" || el.closest("[aria-hidden=true]") || el.hasAttribute("data-ruled-row")) continue;
      const block = el.closest("p, li, dd");
      const inSentence = el.tagName === "A" && block && (block.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 3;
      if ((r.width < 43.5 || r.height < 43.5) && !inSentence) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
}

/** 200% text (R69, design: works at 200% text size): with the page's text doubled, nothing scrolls sideways. */
export async function fitsAtDoubleText(page: Page) {
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  // What sticks out past the screen, deepest first, so a failure says where.
  const wider = () =>
    page.evaluate(() => {
      const w = window.innerWidth;
      if (document.documentElement.scrollWidth <= w + 1) return [];
      return [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((el) => el.getBoundingClientRect().left + el.scrollWidth > w + 1)
        .slice(-4)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 70)} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
    });
  await expect.poll(wider).toEqual([]);
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
}
