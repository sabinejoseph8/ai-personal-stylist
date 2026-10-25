import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { expect, it } from "vitest";
import { claudeAsk, PHOTO_MODEL } from "@/connectors/ai/claude";
import type { PhotoItem } from "@/core/photos/item";
import { createPhotoReader } from "@/core/photos/reader";
import { setting } from "../support/test-guests";
import { countedAsk } from "../support/eval-spend";
import { colorOk, PAIRS, pairPhoto, patternOk, photoOf, pickSingles, type Product, styleOk, typeOk } from "./catalog-answers";

// The photo eval (Phase 3, Sabine's answer to Q2 in 3b): 20 sample catalog photos, one of each kind
// plus the patterned ones, and 4 photos made by putting two catalog items side by side. The right
// answers come from the catalog's own details. Pass mark: at least 85% of details right (type, colors,
// pattern and style), and every item found in the two-item photos. It runs the real photo reader
// (Opus 5.5, low effort) the way the app does, so it costs about 35 cents. Run: npm run eval:photos.
// Catalog photos are cleaner than phone photos, so Sabine's iPhone check covers real ones.

const reader = createPhotoReader(countedAsk(claudeAsk(PHOTO_MODEL, "low", setting("ANTHROPIC_API_KEY"))));
const OUT = "tests/evals/results/photos-latest.json";
const AT_ONCE = 4;

/** The photo as the app sends it to the reader: at most 1024 px, JPEG (lib/photos-service.ts). */
async function read(image: Buffer) {
  const { data, info } = await sharp(image).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const started = performance.now();
  const result = await reader.read({ jpegBase64: data.toString("base64"), width: info.width, height: info.height });
  return { result, seconds: (performance.now() - started) / 1000 };
}

const summarize = (items: PhotoItem[]) => items.map((it) => `${it.name} [${Object.values(it.details).map((d) => `${d.value}${d.status === "to_confirm" ? "?" : ""}`).join(", ")}]`);

async function single(p: Product) {
  const { result, seconds } = await read(await (await photoOf(p.slug)).jpeg().toBuffer());
  const it = result.items?.[0];
  const d = it?.details;
  const checks = [
    { what: "type", ok: !!d && typeOk(p.category, d.type.value) },
    { what: "colors", ok: !!d && colorOk(p.colors, d.colors.value) },
    { what: "pattern", ok: !!d && patternOk(p.attributes.pattern ?? "solid", d.pattern.value) },
    { what: "style", ok: !!d && styleOk(p.style_tags, d.style.value) },
  ];
  const expected = `${p.category}; ${p.colors.join("/")}; ${p.attributes.pattern ?? "solid"}; ${p.style_tags.join("/")}`;
  return { id: p.slug, expected, found: summarize(result.items ?? []), checks, seconds, cost: result.costUsd, failed: !result.items };
}

async function pair([a, b]: [Product, Product]) {
  const { result, seconds } = await read(await pairPhoto(a, b));
  const items = result.items ?? [];
  const checks = [
    { what: "found 2 or more items", ok: items.length >= 2 },
    ...[a, b].map((p) => ({ what: `found the ${p.category}`, ok: items.some((it) => typeOk(p.category, it.details.type.value)) })),
  ];
  return { id: `${a.slug} + ${b.slug}`, expected: `${a.category} + ${b.category}`, found: summarize(items), checks, seconds, cost: result.costUsd, failed: !result.items };
}

it("photo evaluation: at least 85% of details right, and both items found in two-item photos", async () => {
  const jobs = [...pickSingles().map((p) => () => single(p)), ...PAIRS.map((p) => () => pair(p))];
  const results: Awaited<ReturnType<typeof single>>[] = [];
  for (let i = 0; i < jobs.length; i += AT_ONCE) results.push(...(await Promise.all(jobs.slice(i, i + AT_ONCE).map((j) => j()))));

  for (const r of results) {
    const wrong = r.checks.filter((c) => !c.ok).map((c) => c.what);
    console.log(`${r.id.padEnd(48)} ${r.seconds.toFixed(1)}s ${wrong.length ? `WRONG: ${wrong.join(", ")}` : "all right"}`);
    console.log(`${"".padEnd(48)} expected ${r.expected} | found ${r.found.join(" + ") || "(nothing)"}`);
  }
  const singles = results.slice(0, 20).flatMap((r) => r.checks);
  const pairs = results.slice(20).flatMap((r) => r.checks);
  const byDetail = Object.fromEntries(
    ["type", "colors", "pattern", "style"].map((what) => {
      const these = singles.filter((c) => c.what === what);
      return [what, `${these.filter((c) => c.ok).length} of ${these.length}`];
    }),
  );
  const times = results.map((r) => r.seconds).sort((a, b) => a - b);
  const summary = {
    model: PHOTO_MODEL,
    effort: "low",
    date: new Date().toISOString(),
    photos: results.length,
    detailChecks: singles.length,
    detailsRight: singles.filter((c) => c.ok).length,
    detailsRightPercent: Math.round((singles.filter((c) => c.ok).length / singles.length) * 100),
    byDetail,
    twoItemChecks: pairs.length,
    twoItemChecksRight: pairs.filter((c) => c.ok).length,
    failedReadings: results.filter((r) => r.failed).length,
    seconds: { median: Number(times[Math.floor(times.length / 2)].toFixed(2)), p95: Number(times[Math.floor(times.length * 0.95)].toFixed(2)) },
    costUSD: Number(results.reduce((c, r) => c + r.cost, 0).toFixed(4)),
    costPerPhotoUSD: Number((results.reduce((c, r) => c + r.cost, 0) / results.length).toFixed(4)),
  };
  console.log(JSON.stringify(summary, null, 2));
  mkdirSync("tests/evals/results", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ summary, results }, null, 1)}\n`);

  expect(summary.detailsRightPercent).toBeGreaterThanOrEqual(85);
  expect(summary.twoItemChecksRight).toBe(summary.twoItemChecks);
});
