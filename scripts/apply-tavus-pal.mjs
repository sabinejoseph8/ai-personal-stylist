// Creates or updates the Tavus stylist ("PAL") from tavus/stylist-pal.json.
// Run with: node scripts/apply-tavus-pal.mjs
// Reads TAVUS_API_KEY from .env.local and never prints it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const key = env.TAVUS_API_KEY;
if (!key) throw new Error("TAVUS_API_KEY is missing from .env.local");

const config = JSON.parse(readFileSync("tavus/stylist-pal.json", "utf8"));
const idFile = "tavus/pal-id.json";
const existing = existsSync(idFile) ? JSON.parse(readFileSync(idFile, "utf8")).pal_id : null;

async function call(method, path, body) {
  const res = await fetch(`https://tavusapi.com${path}`, {
    method,
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tavus ${method} ${path} failed: ${res.status} ${text.replaceAll(key, "[key]")}`);
  return text ? JSON.parse(text) : {};
}

if (existing) {
  const ops = Object.entries(config).map(([field, value]) => ({ op: "replace", path: `/${field}`, value }));
  await call("PATCH", `/v2/pals/${existing}`, ops);
  console.log(`Updated stylist PAL ${existing}`);
} else {
  const created = await call("POST", "/v2/pals", config);
  const palId = created.pal_id ?? created.persona_id;
  writeFileSync(idFile, JSON.stringify({ pal_id: palId }, null, 2) + "\n");
  console.log(`Created stylist PAL ${palId}`);
}
