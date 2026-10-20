// Phase 0 accuracy and speed check for the jotted-notes reader (product spec 1.4).
// Same replay as replay.mjs: words arrive at 2.5 a second and are sent once a second.
// A note counts as right when some jotted note contains the expected words.
// Run: node spikes/notes-speed/replay-jotted.mjs [sentences.json|heldout.json] [model]
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { readNotes } from "./notes-reader-jotted.mjs";

const set = process.argv[2] ?? "sentences.json";
const model = process.argv[3] ?? "claude-haiku-5-5";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const SEASONS = ["spring", "summer", "fall", "winter"];
// Old fixed-field checks, adapted: seasons are hidden details now, not note text.
const sentences = JSON.parse(readFileSync(`spikes/notes-speed/${set}`, "utf8")).map((s) => ({
  ...s,
  expect: s.expect.map((e) => ({ ...e, has: e.has.filter((h) => !SEASONS.includes(h)) })),
}));
// A corrected value must be gone from every note.
const GONE = { Correction: ["400"], "Held-out: cocktail": ["400"], "Held-out: changed budget": ["300"] };
const lower = (s) => String(s ?? "").toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Each expected word must appear in some note: free-form notes may split one idea, such as "Navy or grey" and "Not black".
const hit = (notes, e) =>
  e.has.every((h) => notes.some((n) => lower(n.text).includes(h) && !(e.lacks ?? []).some((x) => lower(n.text).includes(x))));

async function replay(s) {
  const words = s.text.split(/\s+/);
  const at = (i) => ((i + 1) / 2.5) * 1000;
  const total = at(words.length - 1);
  const calls = [];
  const t0 = performance.now();
  let last = "";
  for (let tick = 1000; ; tick += 1000) {
    const t = Math.min(tick, total);
    await sleep(Math.max(0, t0 + t - performance.now()));
    const heard = words.filter((_, i) => at(i) <= t).join(" ");
    if (heard && heard !== last) {
      last = heard;
      const startedAt = performance.now() - t0;
      calls.push(readNotes(client, model, heard).then((r) => ({ ...r, startedAt, finishedAt: performance.now() - t0 })));
    }
    if (t >= total) break;
  }
  const done = (await Promise.all(calls)).sort((a, b) => a.startedAt - b.startedAt);
  const final = done.at(-1).notes;
  const timings = s.expect.map((e) => {
    const end = at(words.findIndex((w) => lower(w).includes(lower(e.after))));
    const first = done.filter((c) => c.startedAt >= end - 1 && hit(c.notes, e)).sort((a, b) => a.finishedAt - b.finishedAt)[0];
    return { field: e.field, seconds: first ? (first.finishedAt - end) / 1000 : null, finalOk: hit(final, e) };
  });
  const goneOk = (GONE[s.id] ?? []).every((g) => !final.some((n) => lower(n.text).includes(g)));
  return { id: s.id, timings, final, goneOk, cost: done.reduce((c, d) => c + d.costUSD, 0) };
}

function r18Ok(notes) {
  const has = (...w) => notes.some((n) => w.every((x) => lower(n.text).includes(x)));
  const outfit = notes.some((n) => n.kind === "outfit" || n.kind === "owned_item" || /dress|pantsuit|suit/.test(lower(n.text)));
  return has("outdoor", "wedding") && has("november") && has("elegant") && has("emerald") && has("up to", "500") && !outfit;
}

const results = [];
for (const s of sentences) {
  const r = await replay(s);
  results.push(r);
  const wrong = r.timings.filter((t) => !t.finalOk).map((t) => t.field);
  console.log(`${s.id.padEnd(24)} ${wrong.length || !r.goneOk ? "FINAL WRONG: " + [...wrong, ...(r.goneOk ? [] : ["old value kept"])].join(",") + "  " : ""}${r.timings.map((t) => `${t.field}=${t.seconds === null ? "MISSED" : t.seconds.toFixed(2) + "s"}`).join("  ")}`);
  console.log(`${"".padEnd(24)} notes: ${r.final.map((n) => `${n.text} [${n.status === "confirmed" ? "ink" : "pencil"}]`).join(" | ")}`);
}
const all = results.flatMap((r) => r.timings);
const within = all.filter((t) => t.seconds !== null && t.seconds <= 2).length;
const finalRight = all.filter((t) => t.finalOk).length;
const wedding = results.find((r) => r.id === "R18 wedding");
console.log(JSON.stringify({
  model, set, notes: all.length,
  finalCorrect: `${finalRight} of ${all.length}`,
  correctionsDropped: results.every((r) => r.goneOk),
  within2sPercent: Math.round((within / all.length) * 100),
  costUSD: Number(results.reduce((c, r) => c + r.cost, 0).toFixed(4)),
  r18Pass: wedding ? r18Ok(wedding.final) : null,
}, null, 2));
