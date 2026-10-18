// Phase 0 throwaway: a first notes reader. Turns the words heard so far into the
// seven My Styling Notes fields (R15), each with a status (R16).
export const FIELDS = ["occasion", "season_date", "colors", "style", "budget", "outfit_type", "existing_wardrobe"];

export const SYSTEM = `You fill in a shopper's styling notes from what they have said so far in a live conversation.
Rules:
- Only record what the shopper actually said. Never guess. A field nobody mentioned stays "Not specified" with value "".
- If a value is mentioned but vague (for example "not too expensive"), use status "To confirm".
- Clear values get status "Confirmed".
- The latest statement wins: if the shopper corrects a value, keep only the new one.
- season_date: season and/or date, for example "Fall, November". Infer the season from a month (US).
- colors: preferred colors, and colors to avoid written as "not black".
- budget: written as "Up to $500", "Around $400" or "$200 to $300".
- Keep values short, in title case.
The words may stop mid-sentence because the shopper is still talking.`;

const field = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: { type: "string" },
    status: { type: "string", enum: ["Not specified", "To confirm", "Confirmed"] },
  },
  required: ["value", "status"],
};

// Structured output: the reply must match this shape exactly.
export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries(FIELDS.map((f) => [f, field])),
  required: FIELDS,
};

export async function readNotes(client, model, words, effort = "low") {
  const res = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM,
    // Low effort keeps live notes fast; thinking can't be turned off on these models.
    output_config: { effort, format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `Words heard so far: "${words}"` }],
  });
  const block = res.content.find((b) => b.type === "text");
  return { notes: block ? JSON.parse(block.text) : {}, usage: res.usage };
}
