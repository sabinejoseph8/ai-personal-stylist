import Anthropic from "@anthropic-ai/sdk";
import { costOf } from "@/lib/notes-reader.mjs";

export const CAMERA_MODELS = ["claude-haiku-5-5", "claude-opus-5-5"] as const;
export type CameraModel = (typeof CAMERA_MODELS)[number];

const SYSTEM = `You look at one camera frame from a shopper holding up clothing.
Name the main clothing item, shoe or accessory in a short phrase with its color, material and type when visible, for example "Navy wool blazer".
If no clothing item is clearly visible, reply exactly: No item.
Reply with the phrase only.`;

/** Names the item in one camera frame. The frame is read and thrown away, never stored. */
export async function nameItem(jpegBase64: string, model: CameraModel) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpegBase64 } },
          { type: "text", text: "What item is this?" },
        ],
      },
    ],
  });
  const text = res.content.find((b) => b.type === "text");
  const name = text && text.type === "text" ? text.text.trim() : "No item";
  return { name, costUSD: costOf(model, res.usage) };
}
