import "server-only";
import { callProvider } from "@/connectors/conversation/server";
import { createBudgetGuard } from "@/lib/budget-guard";
import type { SessionDeps } from "@/lib/sessions";
import { serverKeyDb } from "@/lib/supabase/admin";

/** What the session endpoints run with on the server: the server key, the call provider and the budget guard. */
export function sessionDeps(): SessionDeps {
  const db = serverKeyDb();
  return { db, provider: callProvider(), guard: createBudgetGuard(db) };
}
