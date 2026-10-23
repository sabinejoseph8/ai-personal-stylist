import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { claudeAsk, LOOKS_MODEL } from "@/connectors/ai/claude";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { createFakeLooksBuilder } from "@/core/looks/builder";
import { createFakeJudge, createJudge } from "@/core/looks/judge";
import type { ShownLook } from "@/core/looks/shown";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { allowException } from "@/lib/exceptions-service";
import { buildLooks, type BuildResult, type LooksDeps } from "@/lib/looks-service";
import { jotWanted, touchSessionNote } from "@/lib/notes-service";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { saveBudget, savePreferences, saveShopping } from "@/lib/profile-store";
import { createTestGuest, serverDb, setting } from "../support/test-guests";

// The heels timing (5c fix 6): Sabine's 5c check, A.5. With the sample profile's Never: high heels allowed
// for the session and "High heels" jotted, how long until each look's shoes are high heels, and what it
// costs, with the real preference checker. Then the note taken back, and the shoes changing back. The
// starting looks come from the fake builder and judge, which cost nothing; only the changes are timed.
// About 15 cents. Run: npm run eval:heels.

const OUT = "tests/evals/results/heels-report.md";
const db = serverDb();
const ask = claudeAsk(LOOKS_MODEL, "medium", setting("ANTHROPIC_API_KEY"));

it("heels timing", async () => {
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
    const catalog = createSampleCatalog(db);
    const guard = createBudgetGuard(db, { ...readBudgetLimits({}), dailyAiUsd: 5 });
    const free: LooksDeps = { db, catalog, guard, builder: createFakeLooksBuilder(), judge: createFakeJudge() };
    const real: LooksDeps = { ...free, judge: createJudge(ask) };
    const spent = async () => ((await db.from("usage").select("claude_microdollars").eq("user_id", guest.id).throwOnError()).data ?? []).reduce((s, u) => s + Number(u.claude_microdollars), 0) / 1e6;
    const run = async (deps: LooksDeps) => {
      const [cost, started] = [await spent(), performance.now()];
      const stages: string[] = [];
      const result = (await buildLooks(deps, guest.id, session, (s) => stages.push(s))) as BuildResult;
      if (!result || !("looks" in result)) throw new Error(JSON.stringify(result));
      return { looks: result.looks, stages, seconds: (performance.now() - started) / 1000, cost: (await spent()) - cost };
    };
    const heel = async (l: ShownLook) => (await catalog.getProduct(l.items.find((i) => i.group === "shoes")!.id))?.details.heelCm ?? 0;
    const describe = async (looks: ShownLook[]) =>
      (await Promise.all(looks.map(async (l) => `- Look ${l.slot}: ${l.items.map((i) => i.name).join(", ")} (heel ${await heel(l)} cm). ${l.change ?? l.note ?? ""}`))).join("\n");
    const rest = (looks: ShownLook[]) => JSON.stringify(looks.map((l) => l.items.filter((i) => i.group !== "shoes").map((i) => i.id)));

    const start = await run(free);
    const heels = (await db.from("saved_preferences").select("id").eq("user_id", guest.id).eq("kind", "never").single().throwOnError()).data!;
    await allowException(db, guest.id, session, heels.id);
    const jotted = await jotWanted({ db }, guest.id, session, { id: heels.id, kind: "never", words: "high heels" });
    const on = await run(real);
    const onHeels = await Promise.all(on.looks.map(heel));
    await touchSessionNote({ db }, guest.id, session, jotted!.notes.find((n) => n.text === "High heels")!.id, "remove");
    const off = await run(real);
    const offHeels = await Promise.all(off.looks.map(heel));

    const out = [
      "# Heels timing (5c fix 6)",
      "",
      `Run on ${new Date().toISOString().slice(0, 10)} with the real preference checker (${LOOKS_MODEL}, medium), on Sabine's 5a wedding with the sample profile. The starting looks came from the fake builder.`,
      "",
      "## Starting looks",
      "",
      await describe(start.looks),
      "",
      `## Never: high heels allowed, "High heels" jotted`,
      "",
      `${Math.round(on.seconds)} seconds, $${on.cost.toFixed(2)} of Claude. Stages: ${[...new Set(on.stages)].join(", ")}. High heels in every look: ${onHeels.every((h) => h > 5) ? "yes" : "NO"}. Other pieces kept: ${rest(on.looks) === rest(start.looks) ? "yes" : "NO"}.`,
      "",
      await describe(on.looks),
      "",
      `## "High heels" removed`,
      "",
      `${Math.round(off.seconds)} seconds, $${off.cost.toFixed(2)} of Claude. Stages: ${[...new Set(off.stages)].join(", ")}. Lower shoes in every look: ${offHeels.every((h) => h <= 5) ? "yes" : "NO"}. Other pieces kept: ${rest(off.looks) === rest(start.looks) ? "yes" : "NO"}.`,
      "",
      await describe(off.looks),
      "",
    ];
    mkdirSync("tests/evals/results", { recursive: true });
    writeFileSync(OUT, out.join("\n"));
    expect(onHeels.every((h) => h > 5)).toBe(true);
    expect(offHeels.every((h) => h <= 5)).toBe(true);
  } finally {
    await guest.remove();
  }
}, 600_000);
