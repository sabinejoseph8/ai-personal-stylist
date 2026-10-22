// "This session only" exceptions (5c; R57, S14, Sabine's answers to Q1 and Q2 in 5c): when the shopper
// asks for something a saved Must have or Never rules out, the stylist asks first, and a card asks the
// same. Allowed, the preference stops limiting this session's looks and is jotted in the notebook with a
// clock; it ends with the session and never changes the profile, unless the shopper taps Save to my
// profile, which takes the preference off it. Pure words, tested in tests/exceptions.test.ts.

/** A saved Must have or Never, by its row's id. */
export type FirmPreference = { id: string; kind: "must_have" | "never"; words: string };

/** An exception as the notebook shows it. */
export type ShownException = FirmPreference & { text: string };

const label = (p: Pick<FirmPreference, "kind">) => (p.kind === "never" ? "Never" : "Must have");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "High heels allowed for this session. Your profile still says Never: high heels." */
export function exceptionText(p: FirmPreference): string {
  const allowed = p.kind === "never" ? `${capital(p.words)} allowed for this session.` : `${capital(p.words)} not needed for this session.`;
  return `${allowed} Your profile still says ${label(p)}: ${p.words}.`;
}

export const shownException = (p: FirmPreference): ShownException => ({ ...p, text: exceptionText(p) });

/** The conflict card's question (design 4.3): "Your profile says Never: high heels. Allow high heels for this session?" */
export function conflictQuestion(p: FirmPreference): string {
  const ask = p.kind === "never" ? `Allow ${p.words} for this session?` : `Go without ${p.words} for this session?`;
  return `Your profile says ${label(p)}: ${p.words}. ${ask}`;
}

/**
 * The question the stylist says word for word once a request is flagged (found on Sabine's iPhone in 5c,
 * A.3: left to her own words, she allowed it herself): "Your profile says never high heels. Shall I
 * allow high heels for this session only, or keep your preference?"
 */
export function spokenQuestion(p: FirmPreference): string {
  const rule = p.kind === "never" ? `never ${p.words}` : `you must have ${p.words}`;
  const change = p.kind === "never" ? `allow ${p.words}` : `go without ${p.words}`;
  return `Your profile says ${rule}. Shall I ${change} for this session only, or keep your preference?`;
}

/**
 * What the shopper asked for, jotted in ink once they allow it, so the looks change to include it
 * (Sabine's answer to Q1 of fix plan 3): "High heels", or "Without sleeves".
 */
export const wantedNote = (p: FirmPreference) => (p.kind === "never" ? capital(p.words) : `Without ${p.words}`);

/** Whether the stylist's words already ask the question (a back-up is said only when they don't). */
export const asksAboutIt = (said: string) => /\bsession\b/i.test(said) && /\b(preference|allow)/i.test(said);

/** Save to my profile's confirmation (Sabine's answer to Q2 in 5c). */
export const takeOffQuestion = (p: FirmPreference) => `Take "${label(p)}: ${p.words}" off your profile? Later sessions will allow it too.`;

/** What the stylist is told: the exceptions allowed, and a request she should ask about now. */
export function exceptionsForStylist(allowed: FirmPreference[], asking: FirmPreference | null): string {
  const lines: string[] = [];
  for (const a of allowed) lines.push(`This session only: the shopper allowed breaking their saved preference ${label(a)}: ${a.words}. Looks may now include it; their profile is unchanged.`);
  if (asking)
    lines.push(
      `You've just asked the shopper: "${spokenQuestion(asking)}" Wait for their answer, by voice or with the buttons on their screen. Don't allow or refuse it yourself, and don't suggest anything with it until they've answered.`,
    );
  return lines.join("\n");
}
