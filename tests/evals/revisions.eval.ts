import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { claudeAsk, LOOKS_MODEL } from "@/connectors/ai/claude";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { createLooksBuilder } from "@/core/looks/builder";
import { createJudge } from "@/core/looks/judge";
import type { ShownLook } from "@/core/looks/shown";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { buildLooks, type BuildResult } from "@/lib/looks-service";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { saveBudget, savePreferences, saveShopping } from "@/lib/profile-store";
import { createTestGuest, serverDb, setting } from "../support/test-guests";

// The revisions report (5b): Sabine's S12 sequence on her 5a wedding (outdoor, November, elegant, up to
// $500, the sample profile), with the real looks builder and preference checker. Keep the main pieces and
// the bag, then lower heels, then closed-toe shoes, then one more change, timing each revision and its
// Claude cost, and checking the kept pieces and the budget hold. About 50 cents. Run: npm run eval:revisions.

const OUT = "tests/evals/results/revisions-report.md";
const db = serverDb();
const ask = claudeAsk(LOOKS_MODEL, "medium", setting("ANTHROPIC_API_KEY"));

it("revisions report", async () => {
  const guest = await createTestGuest();
  try {
    const { budget, preferences, ...shopping } = SAMPLE_PROFILE;
    await saveShopping(guest.db, guest.id, shopping);
    await saveBudget(guest.db, guest.id, budget);
    await savePreferences(guest.db, preferences);
    const session = (await db.from("sessions").insert({ user_id: guest.id, status: "active" }).select("id").single().throwOnError()).data!.id as string;
    const note = (kind: string, text: string, details: [string, string][]) => ({ user_id: guest.id, session_id: session, kind, note_text: text, status: "confirmed", hidden_details: details.map(([name, value]) => ({ name, value })), source: "voice" });
    await db
      .from("session_notes")
      .insert([
        note("occasion", "Outdoor wedding, November", [["event", "wedding"], ["setting", "outdoor"], ["month", "november"]]),
        note("style", "Elegant", [["style", "elegant"]]),
        note("budget", "Budget: up to $500", [["max", "500"]]),
      ])
      .throwOnError();
    const deps = { db, catalog: createSampleCatalog(db), guard: createBudgetGuard(db, { ...readBudgetLimits({}), dailyAiUsd: 5 }), builder: createLooksBuilder(ask), judge: createJudge(ask) };
    const spent = async () => ((await db.from("usage").select("claude_microdollars").eq("user_id", guest.id).throwOnError()).data ?? []).reduce((s, u) => s + Number(u.claude_microdollars), 0) / 1e6;
    const run = async () => {
      const [cost, started] = [await spent(), performance.now()];
      const result = (await buildLooks(deps, guest.id, session)) as BuildResult;
      if (!result || !("looks" in result)) throw new Error(JSON.stringify(result));
      return { looks: result.looks, seconds: (performance.now() - started) / 1000, cost: (await spent()) - cost };
    };
    const describe = (l: ShownLook) => `${l.items.map((i) => `${i.name} (${i.category})`).join(", ")}. ${l.total.toBuy}. ${l.total.comparison ?? ""}`;

    const built = await run();
    const look = built.looks[0];
    const out = ["# Revisions report (5b)", "", `Built on ${new Date().toISOString().slice(0, 10)} with the real looks builder and preference checker (${LOOKS_MODEL}, medium), on Sabine's 5a wedding with the sample profile.`, "", `Looks built in ${Math.round(built.seconds)} seconds, for $${built.cost.toFixed(2)} of Claude.`, "", `**Look 1 to start:** ${describe(look)}`, ""];
    const shoes = () => current.items.findIndex((i) => i.group === "shoes");
    let current = look;
    const kept = current.items.filter((i) => i.group !== "shoes" && i.group !== "accessory" && i.group !== "outer").map((i) => i.id);
    const feedback = (text: string, act: string, items: string[], about = "") =>
      db
        .from("session_notes")
        .insert(note("feedback", text, [["look", String(look.slot)], ["items", items.join(",")], ["act", act], ["scope", "item"], ...(about ? [["about", about] as [string, string]] : [])]))
        .throwOnError();
    await feedback("Keep the main pieces and the bag", "keep", kept);
    const rounds: [string, string][] = [
      ["Lower heels", "lower heel"],
      ["Closed-toe shoes", "closed toe"],
      ["Shoes in tan or nude", "tan or nude color"],
    ];
    let holds = true;
    for (const [n, [text, about]] of rounds.entries()) {
      await feedback(text, "change", [current.items[shoes()].id], about);
      const r = await run();
      const next = r.looks.find((l) => l.slot === look.slot)!;
      const keptAll = kept.every((id) => next.items.some((i) => i.id === id));
      holds &&= keptAll && next.total.fits;
      out.push(`## Round ${n + 1}: "${text}"`, "", next.change ?? next.note ?? "No change.", "", `Look: ${describe(next)}`, "", `Kept pieces held: ${keptAll ? "yes" : "NO"}. Fits the budget: ${next.total.fits ? "yes" : "NO"}. ${Math.round(r.seconds)} seconds, $${r.cost.toFixed(2)} of Claude.`, "");
      current = next;
    }
    mkdirSync("tests/evals/results", { recursive: true });
    writeFileSync(OUT, out.join("\n"));
    expect(holds).toBe(true);
  } finally {
    await guest.remove();
  }
}, 600_000);
