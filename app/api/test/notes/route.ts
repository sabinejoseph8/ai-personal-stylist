import Anthropic from "@anthropic-ai/sdk";
import { passcodeOk } from "@/lib/test-session";
import { readNotes } from "@/lib/notes-reader.mjs";

// Phase 0 test only: turns the shopper's words so far into jotted notes (Haiku 5.5).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!passcodeOk(body?.passcode)) {
    return Response.json({ error: "Wrong passcode" }, { status: 401 });
  }
  if (typeof body?.words !== "string" || !body.words.trim() || body.words.length > 20000) {
    return Response.json({ error: "Words are required" }, { status: 400 });
  }
  const started = Date.now();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const result = await readNotes(client, "claude-haiku-5-5", body.words);
  return Response.json({ notes: result.notes, costUSD: result.costUSD, serverMs: Date.now() - started });
}
