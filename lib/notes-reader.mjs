// Phase 0 notes reader (jotted notes, product spec 1.4: R15 to R18).
// The stylist jots short notes in its own words, each with hidden details for looks and checks.
// Plain code reads money and dates, so budgets and months are exact.

export const KINDS = ["occasion", "timing", "colors", "style", "budget", "outfit", "owned_item", "fit", "other"];

export const SYSTEM = `You are a personal stylist jotting notes while a shopper talks. The words may stop mid-sentence.

Jot short notes in your own words, like a stylist's notebook. Examples for "I'm going to an outdoor wedding in November. I'd like something elegant, preferably emerald green, and my budget is $500":
- "Outdoor wedding, November" (kind occasion)
- "Elegant" (kind style)
- "Emerald green, preferred" (kind colors)
- "Budget: up to $500" (kind budget)

Rules:
- One idea per note, a few words each. Never quote the shopper word for word.
- Keep every describing word that matters: "outdoor wedding", "black tie charity dinner", "company holiday party".
- When an event and its date are said together, jot them as one note: "Outdoor wedding, November".
- Colors to avoid: "Not black". Items they own: "Owns a camel coat".
- Never guess. If the shopper hasn't said something, there is no note for it. Never jot an outfit type unless they said one.
- Corrections ("actually", "let's say", "make it", "instead", "was ... but now"): keep only the newest value, and drop the old note.
- status is "to_confirm" by default. Use "confirmed" only when the shopper explicitly confirmed that detail, for example "yes, that's right".
- Existing notes: you may be given the notes already in the notebook, each with an id. Keep the same id and the same wording for every idea that hasn't changed. Change a note's text only when the shopper changed that detail. Give brand-new notes the id "new".
- Never jot again a note the shopper removed.
- details: the facts behind the note for building and checking outfits, as short name and value pairs, for example event=wedding, setting=outdoor, month=November, prefer=emerald green, avoid=black, max=500.`;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: KINDS },
          text: { type: "string" },
          status: { type: "string", enum: ["to_confirm", "confirmed"] },
          details: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { name: { type: "string" }, value: { type: "string" } },
              required: ["name", "value"],
            },
          },
        },
        required: ["id", "kind", "text", "status", "details"],
      },
    },
  },
  required: ["notes"],
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SEASON_OF = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "fall", "fall", "fall", "winter"];

/** Reads the last budget mentioned: { text, details } or null. */
export function parseBudget(words) {
  const n = String.raw`\$?(\d{2,5})(?:\s*dollars)?`;
  const patterns = [
    [new RegExp(String.raw`between\s+${n}\s+(?:and|to)\s+${n}`, "gi"), (m) => [`$${m[1]} to $${m[2]}`, { min: m[1], max: m[2] }]],
    [/\$(\d{2,5})\s*(?:to|-)\s*\$(\d{2,5})/gi, (m) => [`$${m[1]} to $${m[2]}`, { min: m[1], max: m[2] }]],
    [new RegExp(String.raw`(?:under|up to|max(?:imum)?|no more than|less than|below)\s+${n}`, "gi"), (m) => [`up to $${m[1]}`, { max: m[1] }]],
    [new RegExp(String.raw`(?:around|about|roughly|approximately)\s+${n}`, "gi"), (m) => [`around $${m[1]}`, { around: m[1] }]],
    [new RegExp(String.raw`(?:budget|spend|can do|afford|say)\b[^.$\d]{0,25}?${n}`, "gi"), (m) => [`up to $${m[1]}`, { max: m[1] }]],
    [/\$(\d{2,5})/g, (m) => [`up to $${m[1]}`, { max: m[1] }]],
  ];
  let best = null;
  for (const [re, fmt] of patterns) {
    for (const m of words.matchAll(re)) {
      const end = m.index + m[0].length;
      if (!best || end > best.end) best = { end, out: fmt(m) };
    }
  }
  if (!best) return null;
  const [value, facts] = best.out;
  return { text: `Budget: ${value}`, details: Object.entries(facts).map(([name, v]) => ({ name, value: v })) };
}

/** Reads the last month mentioned: { month, day, season } or null. */
export function parseMonth(words) {
  const re = new RegExp(String.raw`\b(${MONTHS.join("|")})(?:\s+(\d{1,2})(?:st|nd|rd|th)?\b)?`, "gi");
  let last = null;
  for (const m of words.matchAll(re)) last = m;
  if (!last) return null;
  const month = last[1].toLowerCase();
  return { month, day: last[2] ?? null, season: SEASON_OF[MONTHS.indexOf(month)] };
}

/** Prices per million tokens (input, output). */
export const PRICES = { "claude-opus-5-5": [4, 20], "claude-haiku-5-5": [0.1, 0.5], "claude-sonnet-5-5": [2, 10] };
export const costOf = (model, usage) => {
  const [pi, po] = PRICES[model] ?? [0, 0];
  return ((usage?.input_tokens ?? 0) * pi + (usage?.output_tokens ?? 0) * po) / 1e6;
};

/** Reads jotted notes from the words heard so far. */
/**
 * Reads jotted notes from the words heard so far.
 * current: notes already in the notebook ({ id, text, status }); removed: texts the shopper removed.
 */
export async function readNotes(client, model, words, effort = "low", current = [], removed = []) {
  const parts = [`Words heard so far: "${words}"`];
  if (current.length) parts.push(`Existing notes:\n${current.map((n) => `- id ${n.id}: ${n.text} (${n.status})`).join("\n")}`);
  if (removed.length) parts.push(`Removed by the shopper, never jot again:\n${removed.map((r) => `- ${r}`).join("\n")}`);
  const res = await client.messages.create({
    model,
    max_tokens: 3000,
    system: SYSTEM,
    output_config: { effort, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: parts.join("\n\n") }],
  });
  const block = res.content.find((b) => b.type === "text");
  let notes = block ? JSON.parse(block.text).notes : [];

  const budget = parseBudget(words);
  if (budget) {
    const old = notes.find((n) => n.kind === "budget");
    notes = notes.filter((n) => n.kind !== "budget");
    // Keep the old note's id; a changed budget goes back to pencil.
    const same = old && old.text === budget.text;
    notes.push({ id: old?.id ?? "new", kind: "budget", text: budget.text, status: same ? old.status : "to_confirm", details: budget.details });
  }
  const month = parseMonth(words);
  if (month) {
    const facts = [
      { name: "month", value: month.month },
      ...(month.day ? [{ name: "day", value: month.day }] : []),
      { name: "season", value: month.season },
    ];
    const host = notes.find((n) => n.text.toLowerCase().includes(month.month));
    if (host) host.details = [...host.details.filter((d) => !["month", "day", "season"].includes(d.name)), ...facts];
  }
  return { notes, usage: res.usage, costUSD: costOf(model, res.usage) };
}
