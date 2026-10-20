import type Anthropic from "@anthropic-ai/sdk";

export type JottedNote = {
  id: string;
  kind: string;
  text: string;
  status: "to_confirm" | "confirmed";
  details: { name: string; value: string }[];
};
export const KINDS: string[];
export const SYSTEM: string;
export const PRICES: Record<string, [number, number]>;
export function costOf(model: string, usage: { input_tokens?: number; output_tokens?: number } | undefined): number;
export function parseBudget(words: string): { text: string; details: { name: string; value: string }[] } | null;
export function parseMonth(words: string): { month: string; day: string | null; season: string } | null;
export function readNotes(
  client: Anthropic,
  model: string,
  words: string,
  effort?: "low" | "medium" | "high",
  current?: { id: string; text: string; status: string }[],
  removed?: string[],
): Promise<{ notes: JottedNote[] | null; usage: unknown; costUSD: number }>;
