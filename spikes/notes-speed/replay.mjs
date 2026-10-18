// Phase 0 notes speed test (0d). Replays each test sentence in small pieces, as live
// words arrive (about 2.5 words a second, sent once a second), and times each note.
// Run: node spikes/notes-speed/replay.mjs claude-opus-5-5 [low|medium|high]
// Exits with an error if the wedding sentence doesn't produce the R18 notes.
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { readNotes } from "./notes-reader.mjs";

const model = process.argv[2] ?? "claude-opus-5-5";
const effort = process.argv[3] ?? "low";
const WORDS_PER_SECOND = 2.5;
const SEND_EVERY_MS = 1000;
// Prices per million tokens (input, output), from docs/mvp.md assumptions.
const PRICES = { "claude-opus-5-5": [4, 20], "claude-haiku-5-5": [0.1, 0.5], "claude-sonnet-5-5": [2, 10] };

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const sentences = JSON.parse(readFileSync("spikes/notes-speed/sentences.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lower = (s) => String(s ?? "").toLowerCase();

function matches(note, exp) {
  const v = lower(note?.value);
  return exp.has.every((h) => v.includes(h)) && !(exp.lacks ?? []).some((h) => v.includes(h));
}

async function replay(sentence) {
  const words = sentence.text.split(/\s+/);
  const speakMs = (i) => ((i + 1) / WORDS_PER_SECOND) * 1000;
  const totalMs = speakMs(words.length - 1);
  const calls = [];
  const t0 = performance.now();
  let lastSent = "";
  for (let tick = SEND_EVERY_MS; ; tick += SEND_EVERY_MS) {
    const at = Math.min(tick, totalMs);
    await sleep(Math.max(0, t0 + at - performance.now()));
    const heard = words.filter((_, i) => speakMs(i) <= at).join(" ");
    if (heard && heard !== lastSent) {
      lastSent = heard;
      const startedAt = performance.now() - t0;
      calls.push(
        readNotes(client, model, heard, effort).then((r) => ({ ...r, startedAt, finishedAt: performance.now() - t0 })),
      );
    }
    if (at >= totalMs) break;
  }
  const done = (await Promise.all(calls)).sort((a, b) => a.startedAt - b.startedAt);
  const timings = sentence.expect.map((exp) => {
    const idx = words.findIndex((w) => lower(w).includes(lower(exp.after)));
    const phraseEnd = speakMs(idx);
    const hit = done
      .filter((c) => c.startedAt >= phraseEnd - 1 && matches(c.notes[exp.field], exp))
      .sort((a, b) => a.finishedAt - b.finishedAt)[0];
    return { field: exp.field, seconds: hit ? (hit.finishedAt - phraseEnd) / 1000 : null };
  });
  const usage = done.reduce((u, c) => [u[0] + c.usage.input_tokens, u[1] + c.usage.output_tokens], [0, 0]);
  const callSeconds = done.map((c) => (c.finishedAt - c.startedAt) / 1000);
  return { id: sentence.id, timings, final: done.at(-1).notes, usage, callSeconds };
}

function r18Ok(n) {
  const v = (f) => lower(n[f]?.value);
  return v("occasion").includes("outdoor") && v("occasion").includes("wedding") &&
    v("season_date").includes("fall") && v("season_date").includes("november") &&
    v("colors").includes("emerald") && v("style").includes("elegant") &&
    v("budget").includes("up to") && v("budget").includes("500") &&
    n.outfit_type?.status === "Not specified" && n.existing_wardrobe?.status === "Not specified";
}

const results = [];
for (const s of sentences) {
  const r = await replay(s);
  results.push(r);
  console.log(`${s.id.padEnd(18)} ${r.timings.map((t) => `${t.field}=${t.seconds === null ? "MISSED" : t.seconds.toFixed(2) + "s"}`).join("  ")}`);
}

const all = results.flatMap((r) => r.timings);
const times = all.map((t) => t.seconds).filter((x) => x !== null).sort((a, b) => a - b);
const within2 = all.filter((t) => t.seconds !== null && t.seconds <= 2).length;
const p95 = times[Math.min(times.length - 1, Math.ceil(0.95 * all.length) - 1)];
const calls = results.flatMap((r) => r.callSeconds).sort((a, b) => a - b);
const [inTok, outTok] = results.reduce((u, r) => [u[0] + r.usage[0], u[1] + r.usage[1]], [0, 0]);
const [pi, po] = PRICES[model] ?? [0, 0];
const cost = (inTok * pi + outTok * po) / 1e6;
const wedding = results.find((r) => r.id === "R18 wedding");
const summary = {
  model, effort, notes: all.length, within2s: within2, sharePercent: Math.round((within2 / all.length) * 100),
  missed: all.filter((t) => t.seconds === null).length, p95Seconds: p95 ?? null,
  medianCallSeconds: calls[Math.floor(calls.length / 2)], calls: calls.length,
  inputTokens: inTok, outputTokens: outTok, costUSD: Number(cost.toFixed(4)), r18Pass: r18Ok(wedding.final),
};
console.log("\n" + JSON.stringify(summary, null, 2));
writeFileSync(`spikes/notes-speed/results-${model}${effort === "low" ? "" : "-" + effort}.json`, JSON.stringify({ summary, results }, null, 2) + "\n");
if (!summary.r18Pass) {
  console.error("R18 check FAILED. Final wedding notes:", JSON.stringify(wedding.final));
  process.exit(1);
}
