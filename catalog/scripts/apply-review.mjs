// 1e: records Sabine's photo review (risk 13) in catalog/image-sources.json, so the review is
// loaded with each product. Her review page keeps its answers in its own store; Claude saves them
// as a JSON file of { slug: { verdict, reasons, note, at } } first.
// A review only counts for the photo she saw: a photo remade after it needs a new review.
//   node catalog/scripts/apply-review.mjs <review.json>
import { readFileSync, writeFileSync } from "node:fs";

const SOURCES = "catalog/image-sources.json";
const file = JSON.parse(readFileSync(process.argv[2], "utf8"));
const reviews = file.data ?? file;
const sources = JSON.parse(readFileSync(SOURCES, "utf8"));
const tally = { approved: 0, rejected: 0, unreviewed: 0, stale: 0 };

for (const [slug, source] of Object.entries(sources)) {
  const r = reviews[slug];
  if (!r?.verdict) {
    delete source.review;
    tally.unreviewed++;
  } else if (new Date(r.at) < new Date(source.created_at)) {
    delete source.review;
    tally.stale++;
  } else {
    source.review = { verdict: r.verdict, reasons: r.reasons ?? [], note: r.note ?? "", by: "Sabine", at: r.at };
    tally[r.verdict]++;
  }
}
writeFileSync(SOURCES, JSON.stringify(sources, null, 1) + "\n");
console.log(
  `${tally.approved} approved, ${tally.rejected} rejected, ${tally.unreviewed} not reviewed, ${tally.stale} remade since their review`,
);
for (const [slug, s] of Object.entries(sources)) {
  if (s.review?.verdict === "rejected") console.log(`  rejected ${slug}: ${[...s.review.reasons, s.review.note].filter(Boolean).join("; ")}`);
}
