// 1e: generates one image per sample product with the setting Sabine chose (A: medium quality).
// Resumable: products that already have an image are skipped. Originals stay out of git (catalog/raw).
// Run: node catalog/scripts/generate-images.mjs [slug ...]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { IMAGE_MODEL, IMAGE_QUALITY, imagePrompt } from "../image-style.mjs";

const RAW = "catalog/raw";
const SOURCES = "catalog/image-sources.json";
const CONCURRENT = 4;
mkdirSync(RAW, { recursive: true });

const key = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith("OPENAI_API_KEY=")).split("=")[1].trim();
const client = new OpenAI({ apiKey: key });
const products = JSON.parse(readFileSync("catalog/products.json", "utf8"));
const sources = existsSync(SOURCES) ? JSON.parse(readFileSync(SOURCES, "utf8")) : {};
const only = process.argv.slice(2);
const todo = products.filter((p) => (only.length ? only.includes(p.slug) : !existsSync(`${RAW}/${p.slug}.png`)));
console.log(`${todo.length} images to make`);

let done = 0;
async function make(p) {
  const prompt = imagePrompt({ imageDescription: p.image_description });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await client.images.generate({ model: IMAGE_MODEL, prompt, size: "1024x1024", quality: IMAGE_QUALITY, n: 1 });
      writeFileSync(`${RAW}/${p.slug}.png`, Buffer.from(res.data[0].b64_json, "base64"));
      sources[p.slug] = { generator: "OpenAI", model: IMAGE_MODEL, quality: IMAGE_QUALITY, prompt, created_at: new Date().toISOString(), output_tokens: res.usage?.output_tokens ?? null };
      writeFileSync(SOURCES, JSON.stringify(sources, null, 1) + "\n");
      console.log(`${++done}/${todo.length} ${p.slug}`);
      return;
    } catch (e) {
      console.log(`retry ${attempt} ${p.slug}: ${e.status ?? ""} ${String(e.message).slice(0, 120)}`);
      if (e.status === 429 || e.status >= 500) await new Promise((r) => setTimeout(r, 5000 * attempt));
      else if (attempt === 3 || e.status === 400 || e.status === 401) break;
    }
  }
  console.log(`FAILED ${p.slug}`);
}

const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENT }, async () => {
  while (queue.length) await make(queue.shift());
}));
