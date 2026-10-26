// The day's AI allowance (R13's daily limits; lib/budget-guard.ts): what the looks say when it's used up,
// in the words the welcome screen and the camera already use. Shared so the stylist's cue can tell the
// line apart from one about the look itself (25 Oct 2026, from Sabine's iPhone check: B.1 showed
// "couldn't be checked just now" when the day's $1 was spent, and Swap said "No other shoes fit").

/** Why a check has no verdict: the day's AI allowance is used up, or the judgment step failed. */
export type Unchecked = "allowance" | "failed";

/** The start of every line about the day's AI allowance. */
export const TODAYS_LIMIT = "You've reached today's limit for the demo";

/** "You've reached today's limit for the demo, so these stay." */
export const todaysLimit = (stays: string) => `${TODAYS_LIMIT}, so ${stays}.`;

/** Whether a look's note is about the day's allowance, not about the look. */
export const isTodaysLimit = (note: string | null | undefined) => !!note && note.startsWith(TODAYS_LIMIT);
