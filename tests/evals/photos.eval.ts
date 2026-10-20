import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { expect, it } from "vitest";
import { claudeAsk, PHOTO_MODEL } from "@/connectors/ai/claude";
import type { PhotoItem } from "@/core/photos/item";
import { createPhotoReader } from "@/core/photos/reader";
import { setting } from "../support/test-guests";

// The photo eval (Phase 3, Sabine's answer to Q2 in 3b): 20 sample catalog photos, one of each kind
// plus the patterned ones, and 4 photos made by putting two catalog items side by side. The right
// answers come from the catalog's own details. Pass mark: at least 85% of details right (type, colors,
// pattern and style), and every item found in the two-item photos. It runs the real photo reader
// (Opus 5.5, low effort) the way the app does, so it costs about 35 cents. Run: npm run eval:photos.
// Catalog photos are cleaner than phone photos, so Sabine's iPhone check covers real ones.

type Product = { slug: string; category: string; name: string; colors: string[]; style_tags: string[]; attributes: { pattern?: string } };
const catalog: Product[] = JSON.parse(readFileSync("catalog/products.json", "utf8"));
const reader = createPhotoReader(claudeAsk(PHOTO_MODEL, "low", setting("ANTHROPIC_API_KEY")));
const OUT = "tests/evals/results/photos-latest.json";
const AT_ONCE = 4;

// One of each kind of item, then the patterned ones, up to 20.
function pickSingles() {
  const sorted = [...catalog].sort((a, b) => a.slug.localeCompare(b.slug));
  const picked: Product[] = [];
  for (const p of sorted) if (!picked.some((x) => x.category === p.category)) picked.push(p);
  for (const p of sorted) if (picked.length < 20 && (p.attributes.pattern ?? "solid") !== "solid" && !picked.includes(p)) picked.push(p);
  return picked.slice(0, 20);
}
const bySlugStart = (category: string, skip = 0) => [...catalog].sort((a, b) => a.slug.localeCompare(b.slug)).filter((p) => p.category === category)[skip];
const PAIRS: [Product, Product][] = [
  [bySlugStart("blazer"), bySlugStart("jeans")],
  [bySlugStart("dress", 1), bySlugStart("shoes", 2)],
  [bySlugStart("shirt"), bySlugStart("bag")],
  [bySlugStart("coat"), bySlugStart("trousers", 1)],
];

// Words that count as the same answer.
const TYPES: Record<string, string[]> = {
  shoes: ["shoe", "heel", "pump", "boot", "sneaker", "trainer", "flat", "loafer", "sandal", "mule", "oxford", "brogue", "derby", "slingback"],
  accessory: ["belt", "scarf", "hat", "tie", "jewel", "necklace", "earring", "bracelet", "watch", "sunglasses", "cufflink", "glove", "pocket square", "accessor", "beanie", "cap"],
  top: ["top", "blouse", "camisole", "cami", "tank", "shell", "bodysuit", "sweater"],
  trousers: ["trouser", "pant", "chino", "slack"],
  jacket: ["jacket", "bomber", "blazer"],
  blazer: ["blazer", "jacket"],
  shirt: ["shirt", "blouse"],
  suit: ["suit"],
  coat: ["coat", "trench", "parka"],
  jeans: ["jean", "denim"],
  knitwear: ["sweater", "jumper", "knit", "pullover", "turtleneck", "cardigan"],
  skirt: ["skirt"],
  "t-shirt": ["t-shirt", "tee", "tshirt"],
  shorts: ["short"],
  cardigan: ["cardigan", "sweater", "knit"],
  dress: ["dress", "gown"],
  bag: ["bag", "tote", "clutch", "purse", "crossbody", "satchel", "backpack"],
};
const COLOR_FAMILIES = [
  ["black", "jet", "onyx"],
  ["white", "ivory", "cream", "ecru", "off-white"],
  ["grey", "gray", "charcoal", "heather", "slate", "silver"],
  ["navy", "blue", "indigo", "cobalt", "denim"],
  ["green", "emerald", "olive", "sage", "forest", "khaki"],
  ["red", "burgundy", "wine", "maroon", "oxblood", "crimson"],
  ["pink", "blush", "rose", "nude"],
  ["brown", "camel", "tan", "cognac", "chocolate", "rust", "caramel", "chestnut"],
  ["beige", "sand", "stone", "oatmeal", "natural", "nude", "khaki", "taupe", "camel", "tan", "cream"],
  ["yellow", "sunflower", "mustard", "gold"],
  ["gold", "metallic"],
  ["silver", "metallic"],
  ["orange", "rust"],
];
const PATTERNS: Record<string, string[]> = {
  solid: ["solid", "plain", "none"],
  check: ["check", "plaid", "tartan", "gingham", "houndstooth"],
  striped: ["stripe", "pinstripe"],
  floral: ["floral", "flower"],
  "polka dot": ["dot", "spot"],
  "animal print": ["animal", "leopard", "zebra", "snake", "cheetah"],
  "cable knit": ["cable", "knit", "textured", "solid"],
  geometric: ["geometric", "graphic", "abstract", "print"],
  lace: ["lace", "floral"],
  sequin: ["sequin", "embellish", "sparkle", "solid"],
  quilted: ["quilt", "diamond", "solid"],
  textured: ["textur", "solid", "knit", "boucle", "tweed"],
  herringbone: ["herringbone", "tweed", "textur"],
};
const STYLE_FAMILIES = [
  ["elegant", "formal", "sophisticated", "polished", "refined", "dressy", "glamorous"],
  ["classic", "timeless", "tailored", "smart", "traditional", "polished"],
  ["relaxed", "casual", "laid-back", "easy"],
  ["minimal", "minimalist", "clean", "simple", "understated"],
  ["preppy", "classic", "smart"],
  ["bold", "statement", "striking"],
  ["romantic", "feminine", "soft"],
  ["edgy", "rock", "grunge", "punk", "street"],
  ["sporty", "athletic", "athleisure", "sport"],
  ["bohemian", "boho"],
];

const words = (s: string) => s.toLowerCase().split(/[^a-z-]+/).filter(Boolean);
const families = (list: string[][], text: string) => list.flatMap((f, i) => (words(text).some((w) => f.some((x) => w.startsWith(x))) ? [i] : []));
const typeOk = (category: string, value: string) => (TYPES[category] ?? [category]).some((t) => value.toLowerCase().includes(t));
const colorOk = (expected: string[], value: string) => {
  const want = new Set(expected.flatMap((c) => families(COLOR_FAMILIES, c)));
  return families(COLOR_FAMILIES, value).some((f) => want.has(f));
};
const patternOk = (expected: string, value: string) => (PATTERNS[expected] ?? [expected]).some((p) => value.toLowerCase().includes(p));
const styleOk = (expected: string[], value: string) => {
  const want = new Set(expected.flatMap((s) => families(STYLE_FAMILIES, s)));
  return families(STYLE_FAMILIES, value).some((f) => want.has(f));
};

async function photoOf(slug: string) {
  return sharp(readFileSync(`public/catalog/${slug}.jpg`));
}

/** Two catalog photos side by side on white, like a shopper's photo of two items. */
async function pairPhoto(a: Product, b: Product) {
  const [left, right] = await Promise.all([a, b].map(async (p) => (await photoOf(p.slug)).resize(700, 700, { fit: "inside" }).toBuffer()));
  return sharp({ create: { width: 1500, height: 760, channels: 3, background: "#ffffff" } })
    .composite([
      { input: left, left: 20, top: 30 },
      { input: right, left: 780, top: 30 },
    ])
    .jpeg()
    .toBuffer();
}

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
  const it = result?.items[0];
  const d = it?.details;
  const checks = [
    { what: "type", ok: !!d && typeOk(p.category, d.type.value) },
    { what: "colors", ok: !!d && colorOk(p.colors, d.colors.value) },
    { what: "pattern", ok: !!d && patternOk(p.attributes.pattern ?? "solid", d.pattern.value) },
    { what: "style", ok: !!d && styleOk(p.style_tags, d.style.value) },
  ];
  const expected = `${p.category}; ${p.colors.join("/")}; ${p.attributes.pattern ?? "solid"}; ${p.style_tags.join("/")}`;
  return { id: p.slug, expected, found: summarize(result?.items ?? []), checks, seconds, cost: result?.costUsd ?? 0, failed: !result };
}

async function pair([a, b]: [Product, Product]) {
  const { result, seconds } = await read(await pairPhoto(a, b));
  const items = result?.items ?? [];
  const checks = [
    { what: "found 2 or more items", ok: items.length >= 2 },
    ...[a, b].map((p) => ({ what: `found the ${p.category}`, ok: items.some((it) => typeOk(p.category, it.details.type.value)) })),
  ];
  return { id: `${a.slug} + ${b.slug}`, expected: `${a.category} + ${b.category}`, found: summarize(items), checks, seconds, cost: result?.costUsd ?? 0, failed: !result };
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
