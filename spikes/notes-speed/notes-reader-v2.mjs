// Phase 0 throwaway: notes reader v2 for Haiku 5.5 (option B).
// Better instructions with examples, plus plain code that reads money and dates.
// Code results replace the model's budget and season_date whenever the words contain them.
export const FIELDS = ["occasion", "season_date", "colors", "style", "budget", "outfit_type", "existing_wardrobe"];

export const SYSTEM = `You fill in a shopper's styling notes from what they have said so far in a live conversation. The words may stop mid-sentence.

Fields:
- occasion: the event, keeping every describing word the shopper used. "outdoor wedding" -> "Outdoor wedding", "black tie charity dinner" -> "Black tie charity dinner", "company holiday party" -> "Company holiday party".
- season_date: season and date, for example "Fall, November".
- colors: preferred colors. Colors to avoid are written "not black". Example: "Navy, grey, not black".
- style: style words such as "Elegant" or "Relaxed but put together".
- budget: "Up to $500", "Around $400" or "$200 to $300".
- outfit_type: the kind of outfit, such as "Pantsuit", "Suit", "Jumpsuit" or "Dress".
- existing_wardrobe: items the shopper already owns and wants to use.

Status rules:
- "Confirmed" for anything the shopper stated plainly, even inside a longer sentence. "preferably emerald green" is Confirmed.
- "To confirm" only for vague values, such as "not too expensive" or "maybe something nice".
- "Not specified" with value "" for anything not mentioned. Never guess.

Corrections: when the shopper changes their mind ("actually", "let's say", "make it", "instead", "was ... but now"), keep only the newest value.

Write values short, in sentence case.`;

const field = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: { type: "string" },
    status: { type: "string", enum: ["Not specified", "To confirm", "Confirmed"] },
  },
  required: ["value", "status"],
};

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries(FIELDS.map((f) => [f, field])),
  required: FIELDS,
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SEASON_OF = ["Winter", "Winter", "Spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Fall", "Fall", "Fall", "Winter"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Reads the last budget the shopper mentioned. Returns null when there is none. */
export function parseBudget(words) {
  const n = String.raw`\$?(\d{2,5})(?:\s*dollars)?`;
  const patterns = [
    [new RegExp(String.raw`between\s+${n}\s+(?:and|to)\s+${n}`, "gi"), (m) => `$${m[1]} to $${m[2]}`],
    [new RegExp(String.raw`${"\\$"}(\d{2,5})\s*(?:to|-)\s*\$(\d{2,5})`, "gi"), (m) => `$${m[1]} to $${m[2]}`],
    [new RegExp(String.raw`(?:under|up to|max(?:imum)?|no more than|less than|below)\s+${n}`, "gi"), (m) => `Up to $${m[1]}`],
    [new RegExp(String.raw`(?:around|about|roughly|approximately)\s+${n}`, "gi"), (m) => `Around $${m[1]}`],
    [new RegExp(String.raw`(?:budget|spend|can do|afford|say)\b[^.$\d]{0,25}?${n}`, "gi"), (m) => `Up to $${m[1]}`],
    [/\$(\d{2,5})/g, (m) => `Up to $${m[1]}`],
  ];
  let best = null;
  for (const [re, fmt] of patterns) {
    for (const m of words.matchAll(re)) {
      const end = m.index + m[0].length;
      // Later mentions win. At the same position, earlier (more specific) patterns win.
      if (!best || end > best.end) best = { end, value: fmt(m) };
    }
  }
  return best?.value ?? null;
}

/** Reads the last month (with an optional day) or season mentioned. Returns null when there is none. */
export function parseSeasonDate(words) {
  const re = new RegExp(String.raw`\b(${MONTHS.join("|")})(?:\s+(\d{1,2})(?:st|nd|rd|th)?\b)?|\b(spring|summer|fall|autumn|winter)\b`, "gi");
  let last = null;
  for (const m of words.matchAll(re)) last = m;
  if (!last) return null;
  if (last[3]) return cap(last[3].toLowerCase() === "autumn" ? "fall" : last[3].toLowerCase());
  const month = last[1].toLowerCase();
  const season = SEASON_OF[MONTHS.indexOf(month)];
  return `${season}, ${cap(month)}${last[2] ? " " + last[2] : ""}`;
}

export async function readNotes(client, model, words, effort = "low") {
  const res = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort, format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `Words heard so far: "${words}"` }],
  });
  const block = res.content.find((b) => b.type === "text");
  const notes = block ? JSON.parse(block.text) : {};
  const budget = parseBudget(words);
  if (budget) notes.budget = { value: budget, status: "Confirmed" };
  const date = parseSeasonDate(words);
  if (date) notes.season_date = { value: date, status: "Confirmed" };
  return { notes, usage: res.usage };
}
