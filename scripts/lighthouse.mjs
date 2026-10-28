// Phone speed (7a, Sabine's answer to Q3): Lighthouse's mobile report for the welcome screen and About,
// run on this Mac against a production build (npm run build && npm run start -- --port 3100) or the live
// site, never as a GitHub check (scores wobble on shared machines). The plan's target: the welcome screen
// at 90 or more. Usage: npm run lighthouse -- [base URL] (default http://localhost:3100). Each page runs
// three times and the middle score is kept, as Lighthouse advises.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const pages = ["/", "/about"];
const RUNS = 3;

/** Playwright's Chrome, so nothing else needs installing. */
function chrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const dir = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
  if (!dir) throw new Error("No Playwright Chrome found: run npx playwright install chromium, or set CHROME_PATH");
  const mac = readdirSync(join(cache, dir)).find((d) => d.startsWith("chrome-mac"));
  const app = readdirSync(join(cache, dir, mac)).find((d) => d.endsWith(".app"));
  return join(cache, dir, mac, app, "Contents/MacOS", app.replace(/\.app$/, ""));
}

const out = mkdtempSync(join(tmpdir(), "lighthouse-"));
const rows = [];
for (const path of pages) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const file = join(out, `run-${rows.length}-${i}.json`);
    execFileSync(
      "npx",
      ["--yes", "lighthouse@13.6.0", `${base}${path}`, "--only-categories=performance", "--output=json", `--output-path=${file}`, "--quiet", "--chrome-flags=--headless=new"],
      { stdio: "inherit", env: { ...process.env, CHROME_PATH: chrome() } },
    );
    const r = JSON.parse(readFileSync(file, "utf8"));
    const a = r.audits;
    runs.push({
      score: Math.round(r.categories.performance.score * 100),
      fcp: a["first-contentful-paint"].displayValue,
      lcp: a["largest-contentful-paint"].displayValue,
      tbt: a["total-blocking-time"].displayValue,
      cls: a["cumulative-layout-shift"].displayValue,
      file,
    });
  }
  runs.sort((x, y) => x.score - y.score);
  rows.push({ page: path, ...runs[Math.floor(RUNS / 2)], all: runs.map((r) => r.score).join(", ") });
}
console.log(`\nLighthouse, phone (${base}), the middle of ${RUNS} runs:`);
console.table(rows.map(({ page, score, fcp, lcp, tbt, cls, all }) => ({ page, score, "first paint": fcp, "largest paint": lcp, "blocking time": tbt, "layout shift": cls, "all runs": all })));
console.log(`Reports: ${out}`);
const welcome = rows.find((r) => r.page === "/");
if (welcome && welcome.score < 90) {
  console.log(`The welcome screen scores ${welcome.score}, under the target of 90.`);
  process.exitCode = 1;
}
