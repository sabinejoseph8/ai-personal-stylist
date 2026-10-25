import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { expect, it } from "vitest";
import { claudeAsk, type Effort, LIVE_MODEL } from "@/connectors/ai/claude";
import { createCameraReader, type Sighting } from "@/core/camera/reader";
import { setting } from "../support/test-guests";
import { countedAsk } from "../support/eval-spend";
import { colorOk, PAIRS, pairPhoto, photoOf, pickSingles, typeOk } from "./catalog-answers";

// The camera reader check (3c): the photo eval's 20 catalog photos and 4 two-item photos, shrunk to a
// camera frame (640 px), read by the camera reader (Haiku 5.5, low effort, as the app does). It reports
// how often the type and color are right, how often it's sure, and how two-item photos come out.
// There's no pass mark, because the plan doesn't set one. About 1 cent. Run: npm run eval:camera.
// CAMERA_EVAL_EFFORT=off compares thinking switched off (for information).

const EFFORT = (process.env.CAMERA_EVAL_EFFORT ?? "low") as Effort;
const OUT = process.env.CAMERA_EVAL_OUT ?? "tests/evals/results/camera-latest.json";
const reader = createCameraReader(countedAsk(claudeAsk(LIVE_MODEL, EFFORT, setting("ANTHROPIC_API_KEY"))));
const AT_ONCE = 4;

const frameOf = async (image: Buffer) => (await sharp(image).resize(640, 640, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer()).toString("base64");
const words = (s: Sighting) => (s.kind === "item" ? `${s.name} [${s.type}, ${s.color}${s.sure ? "" : ", unsure"}]` : s.kind);

async function read(image: Buffer) {
  const frame = await frameOf(image);
  const started = performance.now();
  const result = await reader.read(frame);
  return { result, seconds: (performance.now() - started) / 1000 };
}

it("camera reader check: how often it names catalog items right at camera size", async () => {
  const singles = pickSingles();
  const jobs = [
    ...singles.map((p) => async () => {
      const { result, seconds } = await read(await (await photoOf(p.slug)).jpeg().toBuffer());
      const s = result.sighting ?? ({ kind: "none" } as Sighting);
      return {
        id: p.slug,
        expected: `${p.category}; ${p.colors.join("/")}`,
        found: words(s),
        typeRight: s.kind === "item" && typeOk(p.category, s.type),
        colorRight: s.kind === "item" && colorOk(p.colors, s.color),
        sure: s.kind === "item" && s.sure,
        two: false,
        seconds,
        cost: result.costUsd,
      };
    }),
    ...PAIRS.map(([a, b]) => async () => {
      const { result, seconds } = await read(await pairPhoto(a, b));
      const s = result.sighting ?? ({ kind: "none" } as Sighting);
      // Several items, or one of the two named: either is a fair answer for a two-item frame.
      const fair = s.kind === "several" || (s.kind === "item" && [a, b].some((p) => typeOk(p.category, s.type)));
      return { id: `${a.slug} + ${b.slug}`, expected: `${a.category} + ${b.category}`, found: words(s), typeRight: fair, colorRight: fair, sure: false, two: true, seconds, cost: result.costUsd };
    }),
  ];
  const results: Awaited<ReturnType<(typeof jobs)[number]>>[] = [];
  for (let i = 0; i < jobs.length; i += AT_ONCE) results.push(...(await Promise.all(jobs.slice(i, i + AT_ONCE).map((j) => j()))));

  for (const r of results) console.log(`${r.id.padEnd(48)} ${r.seconds.toFixed(1)}s expected ${r.expected} | found ${r.found}`);
  const one = results.filter((r) => !r.two);
  const times = results.map((r) => r.seconds).sort((x, y) => x - y);
  const summary = {
    model: LIVE_MODEL,
    effort: EFFORT,
    date: new Date().toISOString(),
    frames: results.length,
    typeRight: `${one.filter((r) => r.typeRight).length} of ${one.length}`,
    colorRight: `${one.filter((r) => r.colorRight).length} of ${one.length}`,
    sure: `${one.filter((r) => r.sure).length} of ${one.length}`,
    twoItemFramesFair: `${results.filter((r) => r.two && r.typeRight).length} of ${results.filter((r) => r.two).length}`,
    seconds: { median: Number(times[Math.floor(times.length / 2)].toFixed(2)), p95: Number(times[Math.floor(times.length * 0.95)].toFixed(2)) },
    costUSD: Number(results.reduce((c, r) => c + r.cost, 0).toFixed(4)),
  };
  console.log(JSON.stringify(summary, null, 2));
  mkdirSync("tests/evals/results", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ summary, results }, null, 1)}\n`);
  expect(results).toHaveLength(24);
});
