import { currentGuest } from "@/lib/guest";
import { exportData } from "@/lib/privacy-service";
import { withinLimit } from "@/lib/rate-limits";
import { serverKeyDb } from "@/lib/supabase/admin";

// Download my data (6b; R65, S9, Sabine's answer to Q1): a ZIP with data.json and the photos. 10 an hour.

export const maxDuration = 60;

export async function GET() {
  const guest = await currentGuest();
  if (!guest) return Response.json({ error: "Your demo has ended. Start again from the welcome screen." }, { status: 401 });
  if (!(await withinLimit(guest.db, "exportData"))) return Response.json({ error: "Too many downloads this hour. Please wait a little, then try again." }, { status: 429 });
  const file = await exportData(serverKeyDb(), guest.id);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(file as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="ai-stylist-my-data-${day}.zip"`,
      "cache-control": "no-store",
    },
  });
}
