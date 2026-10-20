// 1e step 1: the same 10 test products at two quality settings, for Sabine to compare.
// Run: node catalog/scripts/compare-quality.mjs <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { IMAGE_MODEL, imagePrompt } from "../image-style.mjs";

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const key = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith("OPENAI_API_KEY=")).split("=")[1].trim();
const client = new OpenAI({ apiKey: key });

const TESTS = [
  ["emerald-midi-dress", "emerald green satin midi dress with three-quarter sleeves and a V-neck"],
  ["navy-blazer", "women's navy wool single-breasted blazer"],
  ["nude-block-heels", "pair of nude leather block-heel pumps with a 6 cm heel"],
  ["white-sneakers", "pair of plain white leather low-top sneakers"],
  ["camel-tote", "structured camel leather tote bag"],
  ["charcoal-suit-jacket", "men's charcoal grey wool suit jacket, two buttons, notch lapels"],
  ["blue-oxford-shirt", "men's light blue cotton oxford button-down shirt, long sleeves"],
  ["khaki-chinos", "men's khaki cotton chino trousers, folded neatly"],
  ["cream-cable-sweater", "cream chunky cable-knit wool sweater"],
  ["rust-trench-coat", "rust brown belted cotton trench coat"],
];

const results = [];
for (const [id, imageDescription] of TESTS) {
  for (const quality of ["medium", "high"]) {
    const started = Date.now();
    const res = await client.images.generate({ model: IMAGE_MODEL, prompt: imagePrompt({ imageDescription }), size: "1024x1024", quality, n: 1 });
    const file = `${id}-${quality}.png`;
    writeFileSync(`${out}/${file}`, Buffer.from(res.data[0].b64_json, "base64"));
    results.push({ id, quality, file, seconds: (Date.now() - started) / 1000, usage: res.usage ?? null });
    console.log(`${file} ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
}
writeFileSync(`${out}/results.json`, JSON.stringify({ model: IMAGE_MODEL, results }, null, 2));
