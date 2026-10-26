import { DEMO_ONLY } from "@/core/looks/saved";

// Checkout (6a; R61, R62): always refused, on the server as well as the screen. Sample products can't be
// bought, and the catalog says so (capabilities: checkout false). Nothing is read or changed.

export async function POST() {
  return Response.json({ error: DEMO_ONLY }, { status: 403 });
}
