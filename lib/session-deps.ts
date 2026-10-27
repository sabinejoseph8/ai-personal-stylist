import "server-only";
import { callProvider } from "@/connectors/conversation/server";
import { createBudgetGuard } from "@/lib/budget-guard";
import type { SessionDeps } from "@/lib/sessions";
import { serverKeyDb } from "@/lib/supabase/admin";

/**
 * What the session endpoints run with on the server: the server key, the call providers and the budget
 * guard. `fake` is the browser tests' refusals for the fake stylists (never on the live site).
 */
export function sessionDeps(fake?: { video?: string | null; voice?: string | null }): SessionDeps {
  const db = serverKeyDb();
  return { db, provider: callProvider("video", fake?.video), voice: callProvider("voice", fake?.voice), guard: createBudgetGuard(db) };
}
