// 1e: makes the catalog images with OpenAI's half-price Batch API (Sabine's choice, 20 Oct 2026).
// Same model and setting A (medium); OpenAI finishes within 24 hours.
//   node catalog/scripts/batch-images.mjs submit    sends every product that has no image yet
//   node catalog/scripts/batch-images.mjs status    shows progress
//   node catalog/scripts/batch-images.mjs collect   saves finished images to catalog/raw
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import OpenAI, { toFile } from "openai";
import { requiredSetting } from "../../scripts/settings.mjs";
import { IMAGE_MODEL, IMAGE_QUALITY, imagePrompt } from "../image-style.mjs";

const RAW = "catalog/raw";
const SOURCES = "catalog/image-sources.json";
const STATE = "catalog/batch.json";
mkdirSync(RAW, { recursive: true });
const key = requiredSetting("OPENAI_API_KEY");
const client = new OpenAI({ apiKey: key });
const products = JSON.parse(readFileSync("catalog/products.json", "utf8"));
const command = process.argv[2];

if (command === "submit") {
  const todo = products.filter((p) => !existsSync(`${RAW}/${p.slug}.png`));
  const lines = todo.map((p) =>
    JSON.stringify({
      custom_id: p.slug,
      method: "POST",
      url: "/v1/images/generations",
      body: { model: IMAGE_MODEL, prompt: imagePrompt({ imageDescription: p.image_description }), size: "1024x1024", quality: IMAGE_QUALITY, n: 1 },
    }),
  );
  const file = await client.files.create({ file: await toFile(Buffer.from(lines.join("\n") + "\n"), "catalog-images.jsonl"), purpose: "batch" });
  const batch = await client.batches.create({ input_file_id: file.id, endpoint: "/v1/images/generations", completion_window: "24h" });
  writeFileSync(STATE, JSON.stringify({ batch_id: batch.id, submitted_at: new Date().toISOString(), count: todo.length }, null, 1) + "\n");
  console.log(`submitted ${todo.length} images as batch ${batch.id} (${batch.status})`);
} else if (command === "status" || command === "collect") {
  const { batch_id } = JSON.parse(readFileSync(STATE, "utf8"));
  const batch = await client.batches.retrieve(batch_id);
  console.log(`batch ${batch.status}: ${batch.request_counts?.completed ?? 0} done, ${batch.request_counts?.failed ?? 0} failed, of ${batch.request_counts?.total ?? "?"}`);
  if (command === "collect") {
    if (!batch.output_file_id) throw new Error("no results yet");
    const text = await (await client.files.content(batch.output_file_id)).text();
    const sources = existsSync(SOURCES) ? JSON.parse(readFileSync(SOURCES, "utf8")) : {};
    let saved = 0;
    for (const line of text.split("\n").filter(Boolean)) {
      const r = JSON.parse(line);
      const b64 = r.response?.body?.data?.[0]?.b64_json;
      if (r.response?.status_code !== 200 || !b64) {
        console.log(`FAILED ${r.custom_id}: ${r.error?.message ?? r.response?.status_code}`);
        continue;
      }
      writeFileSync(`${RAW}/${r.custom_id}.png`, Buffer.from(b64, "base64"));
      const p = products.find((x) => x.slug === r.custom_id);
      sources[r.custom_id] = {
        generator: "OpenAI",
        model: IMAGE_MODEL,
        quality: IMAGE_QUALITY,
        prompt: imagePrompt({ imageDescription: p.image_description }),
        created_at: new Date().toISOString(),
        output_tokens: r.response.body.usage?.output_tokens ?? null,
        batch: batch_id,
      };
      saved++;
    }
    writeFileSync(SOURCES, JSON.stringify(sources, null, 1) + "\n");
    console.log(`saved ${saved} images`);
  }
} else {
  console.log("usage: batch-images.mjs submit | status | collect");
}
