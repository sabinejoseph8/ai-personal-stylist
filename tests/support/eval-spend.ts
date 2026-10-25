import { afterAll } from "vitest";
import type { Ask } from "@/core/ask";
import { recordEvalSpend } from "./test-guests";

// Real-Claude evals count against the app's monthly Claude stop, as the tech spec says (review batch 1):
// an eval that calls Claude directly, outside the budget guard, records what it spent when its file
// finishes, with no guest attached. Evals that run through the guard keep their guest's spending with
// `remove({ keepAiSpend: true })` instead.

/** Wraps an eval's Claude calls so their real cost is recorded in the month's totals when the file finishes. */
export function countedAsk(ask: Ask): Ask {
  let usd = 0;
  afterAll(() => recordEvalSpend(usd));
  return async (request) => {
    const answer = await ask(request);
    usd += answer.costUsd;
    return answer;
  };
}
