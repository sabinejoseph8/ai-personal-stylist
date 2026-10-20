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
  const current = Array.isArray(body.current)
    ? body.current
        .filter((n: unknown): n is { id: string; text: string; status: string } =>
          typeof (n as { id?: unknown })?.id === "string" && typeof (n as { text?: unknown })?.text === "string")
        .slice(0, 40)
        .map((n: { id: string; text: string; status: string }) => ({ id: n.id.slice(0, 20), text: n.text.slice(0, 200), status: n.status === "confirmed" ? "confirmed" : "to_confirm" }))
    : [];
  const removed = Array.isArray(body.removed) ? body.removed.filter((r: unknown) => typeof r === "string").slice(0, 40).map((r: string) => r.slice(0, 200)) : [];
  const result = await readNotes(client, "claude-haiku-5-5", body.words, "low", current, removed);
  return Response.json({ notes: result.notes, costUSD: result.costUSD, serverMs: Date.now() - started });
}
