import "server-only";
import { claudeAsk, RULE_MODEL } from "@/connectors/ai/claude";
import { createFakeRuleMaker, createRuleMaker, type RuleMaker } from "@/core/looks/rule-maker";
import { type BudgetGuard, createBudgetGuard } from "@/lib/budget-guard";
import { serverKeyDb } from "@/lib/supabase/admin";

/** The fake rule maker is only for automated tests: refused on Vercel's live site, whatever the setting says. */
export function fakeRulesAllowed(env: Record<string, string | undefined> = process.env) {
  return env.RULE_MAKER === "fake" && env.VERCEL_ENV !== "production";
}

/** What the rule maker runs with: the budget guard, and Opus 5.5 at low effort (tech spec 4.4). */
export function ruleMakingDeps(): { guard: BudgetGuard; maker: RuleMaker } {
  return { guard: createBudgetGuard(serverKeyDb()), maker: fakeRulesAllowed() ? createFakeRuleMaker() : createRuleMaker(claudeAsk(RULE_MODEL, "low")) };
}
