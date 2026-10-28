import { expect, test } from "@playwright/test";
import { SAMPLE_PROFILE } from "../lib/profile";
import { canRunDatabaseTests, serverDb, type TestGuest } from "../tests/support/test-guests";
import { fitsAtDoubleText, noSeriousA11yProblems, smallTouchTargets } from "./support/a11y";
import { type BrowserGuest, createBrowserGuest } from "./support/guest";

// 7a's accessibility pass (R69, design: Accessibility): on every page, touch targets of at least 44 by 44
// px, nothing scrolling sideways at 200% text, and the axe check. A guest with the sample profile, so the
// pages show real content.

test("the welcome screen and About, for a new visitor", async ({ page }) => {
  for (const path of ["/", "/about"]) {
    await page.goto(path);
    expect(await smallTouchTargets(page), path).toEqual([]);
    await fitsAtDoubleText(page);
    await noSeriousA11yProblems(page);
  }
});

test.describe("a guest's pages", () => {
  test.skip(!canRunDatabaseTests, "needs SUPABASE_SECRET_KEY");
  let shared: BrowserGuest;
  let guest: TestGuest;
  test.beforeAll(async () => {
    shared = await createBrowserGuest();
    guest = shared.guest;
    const { departments, styleWords, sizes, budget, preferences } = SAMPLE_PROFILE;
    await guest.db
      .from("profiles")
      .upsert({ user_id: guest.id, departments, style_words: styleWords, sizes, budget_meaning: budget?.meaning ?? null, budget_amount_cents: budget ? budget.amount * 100 : null }, { onConflict: "user_id" })
      .throwOnError();
    await guest.db.rpc("replace_saved_preferences", { items: preferences.map((p) => ({ kind: p.kind, words: p.words, rule: p.rule ?? null })) }).throwOnError();
  });
  test.afterAll(async () => guest?.remove());
  test.beforeEach(async ({ context }) => {
    await serverDb().from("rate_limits").delete().eq("user_id", guest.id).throwOnError();
    await context.addCookies(shared.cookies);
  });

  for (const path of ["/", "/session", "/wardrobe", "/saved-looks", "/bag", "/profile", "/setup"]) {
    test(`${path}: 44 px touch targets, 200% text and the axe check`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await smallTouchTargets(page)).toEqual([]);
      await fitsAtDoubleText(page);
      await noSeriousA11yProblems(page);
    });
  }
});
