import "server-only";
import { claudeAsk, LOOKS_MODEL } from "@/connectors/ai/claude";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { createFakeLooksBuilder, createLooksBuilder } from "@/core/looks/builder";
import { createFakeJudge, createJudge } from "@/core/looks/judge";
import { createBudgetGuard } from "@/lib/budget-guard";
import type { LooksDeps } from "@/lib/looks-service";
import { serverKeyDb } from "@/lib/supabase/admin";

/** The fake looks builder and judge are only for automated tests: refused on Vercel's live site, whatever the setting says. */
export function fakeLooksAllowed(env: Record<string, string | undefined> = process.env) {
  return env.LOOKS_BUILDER === "fake" && env.VERCEL_ENV !== "production";
}

/** What building looks runs with: the server key, the sample catalog, the budget guard, and Opus 5.5 at medium effort (tech spec 4.4). */
export function looksDeps(): LooksDeps {
  const db = serverKeyDb();
  const fake = fakeLooksAllowed();
  return {
    db,
    catalog: createSampleCatalog(db),
    guard: createBudgetGuard(db),
    builder: fake ? createFakeLooksBuilder() : createLooksBuilder(claudeAsk(LOOKS_MODEL, "medium")),
    judge: fake ? createFakeJudge() : createJudge(claudeAsk(LOOKS_MODEL, "medium")),
  };
}
