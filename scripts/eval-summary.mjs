// The evaluation's headline numbers, read from the saved results (tests/evals/results/*-latest.json), so
// docs/evaluation.md, the README and the case study can be checked against them without spending a cent
// (7b, the portfolio package). Re-running an eval (npm run eval:notes and so on) rewrites its file.
// Usage: node scripts/eval-summary.mjs [--json]
import { existsSync, readFileSync } from "node:fs";

const read = (name) => {
  const path = `tests/evals/results/${name}-latest.json`;
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).summary : null;
};
const day = (iso) => (iso ? iso.slice(0, 10) : "");
const pct = (n) => `${Math.round(n)}%`;

const notes = read("notes");
const heldOut = read("notes-held-out");
const checker = read("checker");
const photos = read("photos");
const rules = read("rules");
const camera = read("camera");

const rows = [];
if (notes) {
  rows.push({ measure: "Notes right (in-sample)", target: "90%", result: pct(notes.rightPercent), detail: `${notes.right} of ${notes.checks} checks, ${notes.cases} cases, ${notes.model}`, date: day(notes.date) });
  rows.push({ measure: "Notes within 2 seconds (in-sample)", target: "95%", result: pct(notes.within2sPercent), detail: `${notes.timedNotes} timed notes, 95th percentile ${notes.p95Seconds} s`, date: day(notes.date) });
}
if (heldOut) {
  rows.push({ measure: "Notes right (blind set)", target: "90%", result: pct(heldOut.rightPercent), detail: `${heldOut.right} of ${heldOut.checks} checks, ${heldOut.cases} cases, written blind`, date: day(heldOut.date) });
  rows.push({ measure: "Notes within 2 seconds (blind set)", target: "95%", result: pct(heldOut.within2sPercent), detail: `${heldOut.timedNotes} timed notes, 95th percentile ${heldOut.p95Seconds} s`, date: day(heldOut.date) });
}
if (checker) {
  rows.push({ measure: "Rule breaks caught by code", target: "all", result: checker.ruleBreaksCaught, detail: `${checker.looks} looks, ${checker.model}`, date: day(checker.date) });
  rows.push({ measure: "Judged looks right", target: "90%", result: checker.judgedRight, detail: `${pct(checker.judgedRightPercent)}, median ${checker.judgeSeconds.median} s a judgment`, date: day(checker.date) });
}
if (photos) rows.push({ measure: "Photo details right", target: "85%", result: pct(photos.detailsRightPercent), detail: `${photos.detailsRight} of ${photos.detailChecks} details in ${photos.photos} photos; two-item photos ${photos.twoItemChecksRight} of ${photos.twoItemChecks}`, date: day(photos.date) });
if (rules) rows.push({ measure: "Preference rules right", target: "all 16", result: `${rules.right} of ${rules.preferences}`, detail: `${rules.model}, median ${rules.seconds.median} s`, date: day(rules.date) });
if (camera) rows.push({ measure: "Camera frames: type right", target: "none set", result: camera.typeRight, detail: `colors ${camera.colorRight}, median ${camera.seconds.median} s a frame`, date: day(camera.date) });

const cost = [notes, heldOut, checker, photos, rules, camera].filter(Boolean).reduce((s, r) => s + (r.costUSD ?? 0), 0);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ rows, evalCostUSD: Number(cost.toFixed(2)) }, null, 2));
} else {
  console.log("Evaluation headline numbers, from tests/evals/results/*-latest.json\n");
  console.table(rows.map(({ measure, target, result, detail, date }) => ({ measure, target, result, detail, date })));
  console.log(`The saved runs cost $${cost.toFixed(2)} of Claude in all.`);
}
