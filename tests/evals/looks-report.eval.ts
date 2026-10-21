import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { claudeAsk, LOOKS_MODEL } from "@/connectors/ai/claude";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { createLooksBuilder } from "@/core/looks/builder";
import { dollars } from "@/core/looks/budget";
import { createJudge } from "@/core/looks/judge";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { buildLooks, type BuildResult } from "@/lib/looks-service";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { saveBudget, savePreferences, saveShopping } from "@/lib/profile-store";
import { createTestGuest, serverDb, setting, type TestGuest } from "../support/test-guests";

// The sample looks report (4b, Sabine's answer to Q1): looks built for 3 sessions on the live database,
// with the real looks builder and preference checker (Opus 5.5, medium), so Sabine can judge them before
// they're on screen in 4c. For each: the looks, their totals and reasons, and every candidate the
// checker blocked, and why. About 50 cents. Run: npm run looks:report.

const OUT = "tests/evals/results/looks-report.md";
const db = serverDb();
const ask = claudeAsk(LOOKS_MODEL, "medium", setting("ANTHROPIC_API_KEY"));

type Scenario = { title: string; notes: [string, string, [string, string][]][]; ownedBlazer?: boolean };
const SCENARIOS: Scenario[] = [
  {
    title: "The sample profile at an outdoor wedding in November",
    notes: [
      ["occasion", "Outdoor wedding, November", [["event", "wedding"], ["setting", "outdoor"], ["month", "november"]]],
      ["style", "Elegant", [["style", "elegant"]]],
      ["colors", "Emerald green, preferred", [["prefer", "emerald green"]]],
      ["budget", "Budget: up to $350", [["max", "350"]]],
      ["outfit", "Dress", [["outfit", "dress"]]],
    ],
  },
  {
    title: "The sample profile at a job interview",
    notes: [
      ["occasion", "Job interview, next week", [["event", "job interview"]]],
      ["style", "Smart but comfortable", [["style", "smart"], ["comfort", "comfortable"]]],
      ["budget", "Budget: up to $300", [["max", "300"]]],
    ],
  },
  {
    title: "The sample profile with a navy wool blazer photo marked \"You own this\"",
    notes: [
      ["occasion", "Birthday dinner, Saturday", [["event", "birthday dinner"]]],
      ["style", "Relaxed", [["style", "relaxed"]]],
      ["budget", "Budget: up to $250", [["max", "250"]]],
    ],
    ownedBlazer: true,
  },
];

async function run(s: Scenario, guest: TestGuest) {
  const { budget, preferences, ...shopping } = SAMPLE_PROFILE;
  await saveShopping(guest.db, guest.id, shopping);
  await saveBudget(guest.db, guest.id, budget);
  await savePreferences(guest.db, preferences);
  const session = (await db.from("sessions").insert({ user_id: guest.id, status: "active" }).select("id").single().throwOnError()).data!.id as string;
  await db
    .from("session_notes")
    .insert(s.notes.map(([kind, text, details]) => ({ user_id: guest.id, session_id: session, kind, note_text: text, status: "confirmed", hidden_details: details.map(([name, value]) => ({ name, value })), source: "voice" })))
    .throwOnError();
  if (s.ownedBlazer) {
    const sure = (value: string) => ({ value, status: "confirmed" });
    await db
      .from("session_assets")
      .insert({
        user_id: guest.id,
        session_id: session,
        photo_path: "report/blazer.jpg",
        thumbnail_path: "report/blazer-thumb.jpg",
        source: "upload",
        status: "ready",
        ownership: "owned",
        recognized_details: { state: "read", chosen: 0, items: [{ name: "Navy wool blazer", details: { type: sure("blazer"), colors: sure("navy"), pattern: sure("solid"), style: sure("classic") } }] },
      })
      .throwOnError();
  }
  const guard = createBudgetGuard(db, { ...readBudgetLimits({}), dailyAiUsd: 5 });
  const started = performance.now();
  const result = await buildLooks({ db, catalog: createSampleCatalog(db), guard, builder: createLooksBuilder(ask), judge: createJudge(ask) }, guest.id, session);
  const seconds = (performance.now() - started) / 1000;
  const { data: rows } = await db.from("looks").select("id, name, status, items, check_results(verdict, reasons)").eq("session_id", session).throwOnError();
  const { data: usage } = await db.from("usage").select("claude_microdollars").eq("user_id", guest.id).throwOnError();
  const cost = (usage ?? []).reduce((sum, u) => sum + Number(u.claude_microdollars), 0) / 1e6;
  return { result, seconds, rows: rows ?? [], cost };
}

function section(s: Scenario, r: Awaited<ReturnType<typeof run>>) {
  const out = [`## ${s.title}`, "", `Notes, all confirmed: ${s.notes.map(([, text]) => text).join("; ")}. Saved preferences: Never: high heels; Must have: sleeves; Likes: earth tones.`, ""];
  const res = r.result as BuildResult;
  if (!res || !("looks" in res)) return [...out, `No looks: ${JSON.stringify(res)}`, ""].join("\n");
  res.looks.forEach((look, n) => {
    out.push(`### Look ${n + 1}: ${look.name}`, "");
    for (const i of look.items) out.push(`- ${i.name} (${i.category})${i.owned ? ": You own this" : `: ${dollars(i.priceCents ?? 0)}`}`);
    out.push("", `${look.total.toBuy}. ${look.total.comparison ?? ""}`, "", `*${look.reason}*`, "");
  });
  if (res.noMatch) out.push(`**No match:** ${res.noMatch.message} Choices: ${res.noMatch.choices.join(", ")}.`, "");
  const blocked = r.rows.filter((row) => row.status !== "published");
  out.push(`### Candidates the checker didn't publish (${blocked.length})`, "");
  if (!blocked.length) out.push("None: the first 3 candidates all passed.", "");
  for (const row of blocked) {
    const check = (row.check_results as { verdict: string; reasons: { about: string; ok: boolean; why: string }[] }[])[0];
    const failed = check?.reasons.filter((x) => !x.ok).map((x) => `${x.about}: ${x.why}`) ?? [];
    out.push(`- **${row.name}**: ${check?.verdict === "pass" ? "passed, but 3 looks were already published" : failed.join("; ") || check?.verdict}`);
  }
  out.push("", `Built in ${Math.round(r.seconds)} seconds, for $${r.cost.toFixed(2)} of Claude.`, "");
  return out.join("\n");
}

it("sample looks report", async () => {
  const guests = await Promise.all(SCENARIOS.map(() => createTestGuest()));
  try {
    const runs = await Promise.all(SCENARIOS.map((s, i) => run(s, guests[i])));
    const report = [
      "# Sample looks (4b)",
      "",
      `Built on ${new Date().toISOString().slice(0, 10)} with the real looks builder and preference checker (${LOOKS_MODEL}, medium effort), on the live sample catalog. In 4c these appear as look panels.`,
      "",
      ...SCENARIOS.map((s, i) => section(s, runs[i])),
    ].join("\n");
    mkdirSync("tests/evals/results", { recursive: true });
    writeFileSync(OUT, report);
    console.log(report);
    for (const r of runs) expect(r.result && "looks" in r.result).toBe(true);
  } finally {
    await Promise.all(guests.map((g) => g.remove()));
  }
});
