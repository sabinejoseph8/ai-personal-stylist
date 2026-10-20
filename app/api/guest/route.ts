import { z } from "zod";
import { guestDb } from "@/lib/supabase/server";

// Guest sign-in (tech spec section 6): one tap, no email or password.
// Supabase checks the invisible Turnstile answer before it creates a guest.
const StartGuest = z.object({ turnstileToken: z.string().min(1).max(4096) });

/** Who am I? Tells the page whether this browser already has a guest. */
export async function GET() {
  const db = await guestDb();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return Response.json({ guest: false });
  return Response.json({ guest: true, since: claims.iat ? new Date(claims.iat * 1000).toISOString() : null });
}

/** Try the demo: creates a guest for this browser, or keeps the one it already has. */
export async function POST(request: Request) {
  const parsed = StartGuest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bot check missing" }, { status: 400 });

  const db = await guestDb();
  const { data: existing } = await db.auth.getClaims();
  if (existing?.claims) return Response.json({ guest: true, created: false });

  const { data, error } = await db.auth.signInAnonymously({ options: { captchaToken: parsed.data.turnstileToken } });
  if (error || !data.user) {
    return Response.json({ error: "We couldn't start the demo. Please try again." }, { status: 403 });
  }
  return Response.json({ guest: true, created: true });
}
