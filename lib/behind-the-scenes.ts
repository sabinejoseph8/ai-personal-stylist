import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogConnector } from "@/connectors/catalog/types";
import { behindTheScenes, type CheckRecord, type Entry } from "@/core/looks/behind";
import { filterCandidates } from "@/core/looks/candidates";
import type { CheckReason } from "@/core/looks/checker";
import { feedbackOf } from "@/core/notes/feedback";
import type { Detail, NoteKind } from "@/core/notes/types";
import { savedReading } from "@/core/photos/item";
import { lookRequirements } from "@/lib/looks-inputs";
import { SessionEndedError } from "@/lib/notes-store";

// Behind the scenes on the server (4d, R72): the guest's own records for their open session, read with
// the server key, turned into plain-language entries by core/looks/behind.ts. Nothing is written, and
// no AI is used. Photos are described by what was read from them, never shown.

export type { Entry };

type LookRow = { id: string; name: string | null; status: string; input_versions: { slot?: number; swap?: { from: string; to: string }; revision?: { summary?: string } } };
const SHOWN = ["published", "needs_check", "replaced", "saved"];
type CheckRow = { look_id: string; verdict: CheckRecord["verdict"]; reasons: CheckReason[]; created_at: string };

/** The entries for a session, newest first, or null when it isn't the guest's open session. */
export async function behindTheScenesFor(deps: { db: SupabaseClient; catalog: CatalogConnector }, guestId: string, sessionId: string): Promise<Entry[] | null> {
  const { db } = deps;
  const { data: session } = await db.from("sessions").select("id").eq("id", sessionId).eq("user_id", guestId).in("status", ["active", "paused"]).maybeSingle().throwOnError();
  if (!session) return null;

  const mine = <T>(table: string, columns: string) =>
    db
      .from(table)
      .select(columns)
      .eq("session_id", sessionId)
      .eq("user_id", guestId)
      .order("created_at")
      .returns<T[]>()
      .throwOnError()
      .then((r) => r.data ?? []);
  let requirements;
  try {
    requirements = await lookRequirements(db, guestId, sessionId);
  } catch (e) {
    if (e instanceof SessionEndedError) return null;
    throw e;
  }
  const department = requirements.departments.length === 1 ? requirements.departments[0] : undefined;
  const [notes, photos, looks, checks, catalog] = await Promise.all([
    mine<{ note_text: string; kind: string; hidden_details: Detail[]; status: "to_confirm" | "confirmed"; source: string; removed: boolean; updated_at: string }>(
      "session_notes",
      "note_text, kind, hidden_details, status, source, removed, updated_at",
    ),
    mine<{ source: string; status: string; recognized_details: unknown; ownership: "owned" | "inspiration" | null; created_at: string }>(
      "session_assets",
      "source, status, recognized_details, ownership, created_at",
    ),
    mine<LookRow>("looks", "id, name, status, input_versions"),
    mine<CheckRow>("check_results", "look_id, verdict, reasons, created_at"),
    deps.catalog.search({ department, limit: 1000 }),
  ]);

  // A look on screen now, replaced or saved was shown; so was one checked more than once, since only
  // looks on screen are checked again after a change. Its later checks are those checks again.
  const names = new Map(catalog.map((p) => [p.id, p.name]));
  const byId = new Map(looks.map((l) => [l.id, l]));
  // Looks on screen are numbered by their place (Look 2 of 2), as the page numbers them (review batch 2, C13).
  const placed = [...new Set(looks.filter((l) => l.status === "published" || l.status === "needs_check").map((l) => l.input_versions.slot ?? 0))].filter((n) => n >= 1).sort((a, b) => a - b);
  const numberOf = (slot: number | null) => (slot && placed.includes(slot) ? placed.indexOf(slot) + 1 : slot);
  const total = new Map<string, number>();
  for (const c of checks) total.set(c.look_id, (total.get(c.look_id) ?? 0) + 1);
  const seen = new Map<string, number>();
  const records: CheckRecord[] = checks.flatMap((c) => {
    const look = byId.get(c.look_id);
    if (!look) return [];
    const before = seen.get(c.look_id) ?? 0;
    seen.set(c.look_id, before + 1);
    const swap = look.input_versions.swap;
    return [
      {
        at: c.created_at,
        verdict: c.verdict,
        reasons: c.reasons,
        look: {
          name: look.name ?? "Look",
          slot: look.input_versions.slot ?? null,
          number: numberOf(look.input_versions.slot ?? null),
          shown: SHOWN.includes(look.status) || (total.get(c.look_id) ?? 0) > 1,
          swap: swap ? { from: names.get(swap.from) ?? "the old piece", to: names.get(swap.to) ?? "a new piece" } : null,
          revision: look.input_versions.revision?.summary ?? null,
        },
        again: before > 0,
      },
    ];
  });

  const filtered = filterCandidates(catalog, requirements);
  return behindTheScenes({
    now: new Date().toISOString(),
    notes: notes.map((n) => ({
      text: n.note_text,
      status: n.status,
      source: n.source,
      removed: n.removed,
      at: n.updated_at,
      look: feedbackOf({ kind: n.kind as NoteKind, details: n.hidden_details ?? [] })?.look ?? null,
    })),
    photos: photos.filter((p) => p.status === "ready").map((p) => ({ source: p.source, item: { reading: savedReading(p.recognized_details), ownership: p.ownership }, at: p.created_at })),
    checks: records,
    products: { kept: filtered.kept.length, total: catalog.length, leftOut: filtered.leftOut, department },
  });
}
