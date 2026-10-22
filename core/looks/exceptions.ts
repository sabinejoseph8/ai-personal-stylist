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

/** Save to my profile's confirmation (Sabine's answer to Q2 in 5c). */
export const takeOffQuestion = (p: FirmPreference) => `Take "${label(p)}: ${p.words}" off your profile? Later sessions will allow it too.`;

/** What the stylist is told: the exceptions allowed, and a request she should ask about now. */
export function exceptionsForStylist(allowed: FirmPreference[], asking: FirmPreference | null): string {
  const lines: string[] = [];
  for (const a of allowed) lines.push(`This session only: the shopper allowed breaking their saved preference ${label(a)}: ${a.words}. Looks may now include it; their profile is unchanged.`);
  if (asking)
    lines.push(
      `The shopper asked for something their saved preference ${label(asking)}: ${asking.words} rules out. Before anything else, ask in a few words whether to allow it for this session only or keep their preference. Their screen shows the same question with two buttons.`,
    );
  return lines.join("\n");
}
