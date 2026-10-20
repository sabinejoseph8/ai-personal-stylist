// One structured call to Claude, as the stylist core sees it (tech spec 4.4). The core never imports
// an outside service: the AI connector (connectors/ai/claude.ts) is passed in as an Ask.

/** A photo sent with the words, for the photo reader (3b). */
export type ImagePart = { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } };
export type TextPart = { type: "text"; text: string };

export type AskResult = { data: unknown | null; costUsd: number };
/** Null data means refused, cut off or unreadable. */
export type Ask = (request: { system: string; user: string | (ImagePart | TextPart)[]; schema: object; maxTokens: number }) => Promise<AskResult>;
