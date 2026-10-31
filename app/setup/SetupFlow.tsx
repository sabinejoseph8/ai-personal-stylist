"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icons";
import { describeRule } from "@/core/looks/rules";
import {
  DEPARTMENTS,
  PREFERENCE_KINDS,
  SIZE_FIELDS,
  STYLE_WORDS,
  type Budget,
  type PreferenceKind,
  type Preferences,
  type Profile,
  RuleSchema,
} from "@/lib/profile";
import { goToSession } from "@/components/session/session-entry";
import { applySampleProfile, saveBudgetAndPreferencesStep, saveShoppingStep } from "./actions";

type Result = Awaited<ReturnType<typeof saveShoppingStep>>;

/** Runs a save. If the server can't be reached at all, it answers like a failed save instead of throwing. */
async function reach(save: () => Promise<Result>): Promise<Result> {
  try {
    return await save();
  } catch {
    return { ok: false, error: "That didn't save. Check your connection and try again." };
  }
}

// Setup in three steps (R4, design 5.2). Every step has Back, Skip and Continue. Nothing is asked for here:
// the microphone is requested at Start conversation, and the camera only when the shopper taps Camera.

const inputClass =
  "focus-ring type-body min-h-touch w-full rounded-control border border-control-edge bg-page px-3 text-ink placeholder:text-graphite";

function Steps({ step, children }: { step: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="type-label m-0 text-graphite">Step {step} of 3</p>
      {children}
    </div>
  );
}

function Actions({ onBack, onSkip, onContinue, busy, continueLabel = "Continue", waiting }: {
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  busy: boolean;
  continueLabel?: string;
  /** Continue waits for this, shown as its label. */
  waiting?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
      <Button variant="quiet" onClick={onBack} disabled={busy}>
        Back
      </Button>
      <span className="flex-1" />
      <Button variant="secondary" onClick={onSkip} disabled={busy}>
        Skip
      </Button>
      <Button onClick={onContinue} disabled={busy || Boolean(waiting)}>
        {busy ? "Saving…" : (waiting ?? continueLabel)}
      </Button>
    </div>
  );
}

type Preference = Preferences[number];
const isFirm = (kind: PreferenceKind) => kind === "must_have" || kind === "never";
const keyOf = (p: Pick<Preference, "kind" | "words">) => `${p.kind}:${p.words.toLowerCase()}`;

/** How the app reads a Must have or Never preference (4a, Sabine's answer to Q1): "Read as: no shoes with heels over 5 cm". */
function readBack(p: Preference, reading: boolean) {
  if (reading) return "Reading it…";
  if (p.kind === "likes") return null;
  // Not made yet (the rule maker couldn't be reached): until it is, the stylist's judgment checks it.
  const said = p.rule ? describeRule(p.kind, p.rule) : "Checked by your stylist's judgment";
  return `Read as: ${said.charAt(0).toLowerCase()}${said.slice(1)}`;
}

function PreferenceList({ kind, label, hint, items, reading, onChange, onAdded }: {
  kind: PreferenceKind;
  label: string;
  hint: string;
  items: Preferences;
  /** Preferences whose rule is being made, by keyOf. */
  reading: Set<string>;
  onChange: (next: Preferences) => void;
  onAdded: (added: Preference) => void;
}) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const mine = items.filter((p) => p.kind === kind);
  const firm = isFirm(kind);
  const add = () => {
    const words = draft.trim().slice(0, 80);
    if (!words || mine.some((p) => p.words.toLowerCase() === words.toLowerCase())) return;
    const added: Preference = { kind, words };
    onChange([...items, added]);
    onAdded(added);
    setDraft("");
  };
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="type-subheading mb-1 p-0">{label}</legend>
      {mine.length > 0 && (
        <ul className={`m-0 flex list-none gap-2 p-0 ${firm ? "flex-col items-start" : "flex-wrap"}`}>
          {mine.map((p) => (
            <li key={p.words} className="flex flex-col items-start gap-1">
              <span className="type-label inline-flex min-h-touch items-center gap-1 rounded-pill border border-hairline bg-page pl-3">
                <Icon name="savedPreference" className="text-graphite" />
                {label}: {p.words}
                <button
                  type="button"
                  className="focus-ring inline-flex size-touch items-center justify-center rounded-pill text-graphite hover:text-red-pen"
                  aria-label={`Remove ${label}: ${p.words}`}
                  onClick={() => onChange(items.filter((x) => x !== p))}
                >
                  ×
                </button>
              </span>
              {firm && (
                <span aria-live="polite" className="type-small pl-3 text-graphite">
                  {readBack(p, reading.has(keyOf(p)))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Add a {label} preference
        </label>
        <input
          id={id}
          className={inputClass}
          placeholder={hint}
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
    </fieldset>
  );
}

export function SetupFlow({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [profile, setProfile] = useState<Profile>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // Each Must have and Never gets its rule from the rule maker, read back before it's saved (4a). A
  // preference saved before 4a has none yet, so it's made when setup opens; each is asked for once.
  const missingRule = (p: Preference) => isFirm(p.kind) && !p.rule;
  const [reading, setReading] = useState(() => new Set(initial.preferences.filter(missingRule).map(keyOf)));
  const asked = useRef(new Set<string>());
  async function makeRule(p: Preference) {
    if (asked.current.has(keyOf(p))) return;
    asked.current.add(keyOf(p));
    const res = await fetch("/api/preferences/rule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: p.kind, words: p.words }),
    }).catch(() => null);
    const answer = res?.ok ? ((await res.json().catch(() => null)) as { rule?: unknown } | null) : null;
    const rule = RuleSchema.safeParse(answer?.rule);
    if (rule.success) setProfile((prev) => ({ ...prev, preferences: prev.preferences.map((x) => (keyOf(x) === keyOf(p) ? { ...x, rule: rule.data } : x)) }));
    setReading((prev) => {
      const next = new Set(prev);
      next.delete(keyOf(p));
      return next;
    });
  }
  useEffect(() => {
    // The rule maker is an outside system: its answers set state when they arrive, not during the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    for (const p of initial.preferences) if (missingRule(p)) void makeRule(p);
    // Once, for the preferences setup opened with; makeRule asks for each one only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ruleFor = (p: Preference) => {
    if (!isFirm(p.kind)) return;
    asked.current.delete(keyOf(p));
    setReading((prev) => new Set(prev).add(keyOf(p)));
    void makeRule(p);
  };

  const [meaning, setMeaning] = useState<"up_to" | "around" | "between">(initial.budget?.meaning ?? "up_to");
  const [amount, setAmount] = useState(initial.budget ? String(initial.budget.amount) : "");
  const [max, setMax] = useState(initial.budget?.meaning === "between" ? String(initial.budget.max) : "");

  const go = (next: 1 | 2 | 3 | "session" | "welcome") => {
    setError(null);
    // Leaving setup: next time it opens at step 1 (Next.js keeps this page's state while it's hidden).
    if (next === "session" || next === "welcome") setStep(1);
    // A full load, so the session page's camera and microphone policy applies (Chrome, 30 Oct 2026).
    if (next === "session") goToSession();
    else if (next === "welcome") router.push("/");
    else setStep(next);
  };

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  function budget(): Budget | "invalid" {
    if (!amount.trim()) return null;
    const a = Number(amount);
    const m = Number(max);
    if (!Number.isInteger(a) || a < 1) return "invalid";
    if (meaning === "between") return Number.isInteger(m) && m > a ? { meaning, amount: a, max: m } : "invalid";
    return { meaning, amount: a };
  }

  const sample = () =>
    start(async () => {
      const r = await reach(() => applySampleProfile());
      if (r.ok) go("session");
      else setError(r.error);
    });

  const saveStep2 = () =>
    start(async () => {
      const r = await reach(() => saveShoppingStep({ departments: profile.departments, styleWords: profile.styleWords, sizes: profile.sizes }));
      if (r.ok) go(3);
      else setError(r.error);
    });

  const saveStep3 = () => {
    const b = budget();
    if (b === "invalid") {
      setError(meaning === "between" ? "Enter two whole dollar amounts, with the second one higher." : "Enter the budget as a whole dollar amount, such as 400.");
      return;
    }
    start(async () => {
      const r = await reach(() => saveBudgetAndPreferencesStep({ budget: b, preferences: profile.preferences }));
      if (r.ok) go("session");
      else setError(r.error);
    });
  };

  const showSize = (dep: string | null) => dep === null || profile.departments.length === 0 || profile.departments.includes(dep as (typeof DEPARTMENTS)[number]);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 tablet:px-6">
      {error && <Banner tone="error" title={error} />}

      {step === 1 && (
        <Steps step={1}>
          <h1 className="type-title m-0">How it works</h1>
          <ul className="type-body m-0 flex list-disc flex-col gap-2 pl-5">
            <li>Talk with your stylist. She jots down what matters in My Styling Notes, and you confirm or remove any note.</li>
            <li>Show what you own on camera or in a photo, and get complete looks built around it.</li>
            <li>Everything here is a sample. Nothing can be bought.</li>
          </ul>
          <h2 className="type-subheading m-0">What&apos;s kept private</h2>
          <p className="type-body m-0 text-graphite">
            Your profile stays in this browser&apos;s private guest account, and is deleted after 7 days without use. No audio,
            transcripts or video are kept. You can download or delete your data at any time.
          </p>
          <div className="flex flex-col gap-2 rounded-panel border border-hairline bg-page p-4">
            <p className="type-body m-0">Short on time? Start with ready-made answers, including &quot;Never: high heels&quot;.</p>
            <Button variant="secondary" onClick={sample} disabled={busy} className="self-start">
              Use a sample profile
            </Button>
          </div>
          <Actions busy={busy} onBack={() => go("welcome")} onSkip={() => go(2)} onContinue={() => go(2)} />
        </Steps>
      )}

      {step === 2 && (
        <Steps step={2}>
          <h1 className="type-title m-0">What you shop for</h1>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="type-subheading mb-2 p-0">Departments</legend>
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map((d) => (
                <Chip key={d} selected={profile.departments.includes(d)} onClick={() => setProfile({ ...profile, departments: toggle(profile.departments, d) })}>
                  {d === "womenswear" ? "Womenswear" : "Menswear"}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="type-subheading mb-2 p-0">Style words</legend>
            <div className="flex flex-wrap gap-2">
              {STYLE_WORDS.map((w) => (
                <Chip key={w} selected={profile.styleWords.includes(w)} onClick={() => setProfile({ ...profile, styleWords: toggle(profile.styleWords, w) })}>
                  {w}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="type-subheading mb-2 p-0">Sizes</legend>
            <div className="grid grid-cols-2 gap-3">
              {SIZE_FIELDS.filter((f) => showSize(f.department)).map((f) => (
                <label key={f.key} className="type-label flex flex-col gap-1">
                  {f.label}
                  <input
                    className={inputClass}
                    maxLength={12}
                    value={profile.sizes[f.key] ?? ""}
                    onChange={(e) => setProfile({ ...profile, sizes: { ...profile.sizes, [f.key]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <Actions busy={busy} onBack={() => go(1)} onSkip={() => go(3)} onContinue={saveStep2} />
        </Steps>
      )}

      {step === 3 && (
        <Steps step={3}>
          <h1 className="type-title m-0">Budget and saved preferences</h1>
          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="type-subheading mb-2 p-0">Default budget for a look</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Budget meaning">
              {(["up_to", "around", "between"] as const).map((m) => (
                <Chip key={m} selected={meaning === m} role="radio" aria-checked={meaning === m} aria-pressed={undefined} onClick={() => setMeaning(m)}>
                  {m === "up_to" ? "Up to" : m === "around" ? "Around" : "Between"}
                </Chip>
              ))}
            </div>
            <div className="flex items-end gap-3">
              <label className="type-label flex flex-1 flex-col gap-1">
                {meaning === "between" ? "From ($)" : "Amount ($)"}
                <input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} />
              </label>
              {meaning === "between" && (
                <label className="type-label flex flex-1 flex-col gap-1">
                  To ($)
                  <input className={inputClass} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/[^0-9]/g, ""))} />
                </label>
              )}
            </div>
          </fieldset>
          <p className="type-body m-0 text-graphite">Must have and Never are firm rules: no look will break them. Likes only guide choices.</p>
          {PREFERENCE_KINDS.map((k) => (
            <PreferenceList
              key={k.kind}
              kind={k.kind}
              label={k.label}
              hint={k.hint}
              items={profile.preferences}
              reading={reading}
              onChange={(preferences) => setProfile({ ...profile, preferences })}
              onAdded={ruleFor}
            />
          ))}
          <Actions
            busy={busy}
            onBack={() => go(2)}
            onSkip={() => go("session")}
            onContinue={saveStep3}
            continueLabel="Finish setup"
            waiting={[...reading].some((k) => profile.preferences.some((p) => keyOf(p) === k)) ? "Reading your preferences…" : undefined}
          />
        </Steps>
      )}
    </main>
  );
}
