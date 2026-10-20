import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Ask } from "@/core/ask";

// The AI connector (tech spec 4.4): structured calls to Claude, with the cost of each call worked out
// for the budget guard. Haiku 5.5 runs live notes and the camera; Opus 5.5 the rest (TQ3).

export const LIVE_MODEL = "claude-haiku-5-5";
/** The photo reader runs on Opus 5.5, where accuracy matters more than speed (tech spec 4.4). */
export const PHOTO_MODEL = "claude-opus-5-5";

/** Dollars per million tokens (input, output). */
const PRICES: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20], "claude-haiku-5-5": [0.1, 0.5] };

export function costOf(model: string, usage: { input_tokens?: number; output_tokens?: number } | undefined) {
  const [input, output] = PRICES[model] ?? [0, 0];
  return ((usage?.input_tokens ?? 0) * input + (usage?.output_tokens ?? 0) * output) / 1e6;
}

/** How hard Claude thinks before answering. "off" skips thinking: the live notes reader uses it, because
 * thinking took about 1.2 of a reading's 2.5 seconds without making the notes better (measured in 2c). */
export type Effort = "off" | "low" | "medium" | "high";

/** A structured call. A refusal, a cut-off answer, unreadable JSON or a failed call give null data. */
export function claudeAsk(model = LIVE_MODEL, effort: Effort = "low", apiKey = process.env.ANTHROPIC_API_KEY): Ask {
  const client = new Anthropic({ apiKey });
  return async ({ system, user, schema, maxTokens }) => {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        // Structured output (forced tool use isn't allowed on these models).
        ...(effort === "off"
          ? { thinking: { type: "disabled" }, output_config: { format: { type: "json_schema", schema } } }
          : { output_config: { effort, format: { type: "json_schema", schema } } }),
        messages: [{ role: "user", content: user }],
      } as Parameters<typeof client.messages.create>[0]) as Anthropic.Message;
      const costUsd = costOf(model, res.usage);
      const block = res.content.find((b) => b.type === "text");
      if (res.stop_reason !== "end_turn" || !block || block.type !== "text") {
        console.warn(`claude: no usable answer (${res.stop_reason})`);
        return { data: null, costUsd };
      }
      try {
        return { data: JSON.parse(block.text), costUsd };
      } catch {
        return { data: null, costUsd };
      }
    } catch (e) {
      console.error(`claude: the call failed: ${e instanceof Error ? e.message : e}`);
      return { data: null, costUsd: 0 };
    }
  };
}
