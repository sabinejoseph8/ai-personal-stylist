import { active, type Detail, type Note, type NoteChanges, sameDetails } from "./types";

// Plain code reads money and dates, so budgets and months are exact (tech spec 5, pattern 7). It runs
// before Claude does, so a budget appears as soon as it's said. Ported from the Phase 0 reader.

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SEASON_OF = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "fall", "fall", "fall", "winter"];

// Numbers followed by these aren't money: "below 40 degrees", "about 30 minutes" (Phase 2 review).
const UNITS = "degrees|minutes|mins|hours|hrs|seconds|secs|people|guests|inches|inch|cm|centimeters|feet|ft|pounds|lbs|kg|kilos|years|days|weeks|months|miles|km|percent";

/** Reads the last budget mentioned, such as "Budget: up to $500", or null. */
export function parseBudget(words: string): { text: string; details: Detail[] } | null {
  const n = String.raw`\$?(\d{2,5})(?!\d)(?!\s*(?:%|°|(?:${UNITS})\b))(?:\s*dollars)?`;
  const patterns: [RegExp, (m: RegExpMatchArray) => [string, Record<string, string>]][] = [
    [new RegExp(String.raw`between\s+${n}\s+(?:and|to)\s+${n}`, "gi"), (m) => [`$${m[1]} to $${m[2]}`, { min: m[1], max: m[2] }]],
    [/\$(\d{2,5})\s*(?:to|-)\s*\$(\d{2,5})/gi, (m) => [`$${m[1]} to $${m[2]}`, { min: m[1], max: m[2] }]],
    [new RegExp(String.raw`(?:under|up to|max(?:imum)?|no more than|less than|below)\s+${n}`, "gi"), (m) => [`up to $${m[1]}`, { max: m[1] }]],
    [new RegExp(String.raw`(?:around|about|roughly|approximately)\s+${n}`, "gi"), (m) => [`around $${m[1]}`, { around: m[1] }]],
    [new RegExp(String.raw`(?:budget|spend|can do|afford|say)\b[^.$\d]{0,25}?${n}`, "gi"), (m) => [`up to $${m[1]}`, { max: m[1] }]],
    [/\$(\d{2,5})/g, (m) => [`up to $${m[1]}`, { max: m[1] }]],
  ];
  let best: { end: number; out: [string, Record<string, string>] } | null = null;
  for (const [re, format] of patterns) {
    for (const m of words.matchAll(re)) {
      const end = (m.index ?? 0) + m[0].length;
      if (!best || end > best.end) best = { end, out: format(m) };
    }
  }
  if (!best) return null;
  const [value, facts] = best.out;
  return { text: `Budget: ${value}`, details: Object.entries(facts).map(([name, v]) => ({ name, value: v })) };
}

// "May" and "March" are also everyday words ("I may need a coat"), so they count as months only after
// words like "in" or "early", or with a day ("May 14th") (Phase 2 review).
const BEFORE_MONTH = /\b(in|on|of|by|until|till|since|early|late|mid|next|this|last|end of|start of)\s+$/i;
const isMonth = (m: RegExpMatchArray, words: string) =>
  !/^(may|march)$/i.test(m[1]) || Boolean(m[2]) || BEFORE_MONTH.test(words.slice(0, m.index));

/** Reads the last month mentioned, with its day if said, and the season it falls in. */
export function parseMonth(words: string): { month: string; day: string | null; season: string } | null {
  const re = new RegExp(String.raw`\b(${MONTHS.join("|")})(?:\s+(\d{1,2})(?:st|nd|rd|th)?\b)?`, "gi");
  let last: RegExpMatchArray | null = null;
  for (const m of words.matchAll(re)) if (isMonth(m, words)) last = m;
  if (!last) return null;
  const month = last[1].toLowerCase();
  return { month, day: last[2] ?? null, season: SEASON_OF[MONTHS.indexOf(month)] };
}

/**
 * The changes plain code makes from the words: the budget note (one per session, so a new amount is a
 * correction that keeps the note's status, Sabine's answer to Q1 in 2c), and month details on the
 * note that mentions the month.
 */
export function plainChanges(notes: Note[], words: string): NoteChanges {
  const changes: NoteChanges = { add: [], update: [], remove: [] };
  const live = active(notes);
  const budget = parseBudget(words);
  if (budget) {
    const old = live.find((n) => n.kind === "budget");
    if (!old) changes.add.push({ kind: "budget", text: budget.text, status: "to_confirm", details: budget.details });
    else if (old.text !== budget.text) changes.update.push({ id: old.id, text: budget.text, status: old.status, details: budget.details });
  }
  const month = parseMonth(words);
  if (month) {
    const named = new RegExp(String.raw`\b${month.month}\b`, "i");
    const host = live.find((n) => n.kind !== "budget" && named.test(n.text));
    if (host) {
      const facts: Detail[] = [
        { name: "month", value: month.month },
        ...(month.day ? [{ name: "day", value: month.day }] : []),
        { name: "season", value: month.season },
      ];
      const details = [...host.details.filter((d) => !["month", "day", "season"].includes(d.name)), ...facts];
      if (!sameDetails(details, host.details)) changes.update.push({ id: host.id, text: host.text, status: host.status, details });
    }
  }
  return changes;
}
