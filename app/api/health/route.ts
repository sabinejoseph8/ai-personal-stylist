import { checkHealth } from "@/lib/health";
import { serverKeyDb } from "@/lib/supabase/admin";

// GET /api/health (7c monitoring): the uptime check reads it every 30 minutes. 200 when the database
// answers, the daily job ran in the last 26 hours without a failure, and no call is stuck waiting to be
// ended; 503 otherwise. Only yes or no answers.

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkHealth(serverKeyDb());
  return Response.json(health, { status: health.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
