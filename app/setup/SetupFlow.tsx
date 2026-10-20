"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icons";
import {
  DEPARTMENTS,
  PREFERENCE_KINDS,
  SIZE_FIELDS,
  STYLE_WORDS,
  type Budget,
  type PreferenceKind,
  type Preferences,
  type Profile,
} from "@/lib/profile";
import { applySampleProfile, saveBudgetAndPreferencesStep, saveShoppingStep } from "./actions";

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

function Actions({ onBack, onSkip, onContinue, busy, continueLabel = "Continue" }: {
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  busy: boolean;
  continueLabel?: string;
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
      <Button onClick={onContinue} disabled={busy}>
        {busy ? "Saving…" : continueLabel}
      </Button>
    </div>
  );
}

function PreferenceList({ kind, label, hint, items, onChange }: {
  kind: PreferenceKind;
  label: string;
  hint: string;
  items: Preferences;
  onChange: (next: Preferences) => void;
}) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const mine = items.filter((p) => p.kind === kind);
  const add = () => {
    const words = draft.trim().slice(0, 80);
    if (!words || mine.some((p) => p.words.toLowerCase() === words.toLowerCase())) return;
    onChange([...items, { kind, words }]);
    setDraft("");
  };
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="type-subheading mb-1 p-0">{label}</legend>
      {mine.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {mine.map((p) => (
            <li key={p.words} className="type-label inline-flex min-h-touch items-center gap-1 rounded-pill border border-hairline bg-page pl-3">
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

  const [meaning, setMeaning] = useState<"up_to" | "around" | "between">(initial.budget?.meaning ?? "up_to");
  const [amount, setAmount] = useState(initial.budget ? String(initial.budget.amount) : "");
  const [max, setMax] = useState(initial.budget?.meaning === "between" ? String(initial.budget.max) : "");

  const go = (next: 1 | 2 | 3 | "session" | "welcome") => {
    setError(null);
    if (next === "session") router.push("/session");
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
      const r = await applySampleProfile();
      if (r.ok) go("session");
      else setError(r.error);
    });

  const saveStep2 = () =>
    start(async () => {
      const r = await saveShoppingStep({ departments: profile.departments, styleWords: profile.styleWords, sizes: profile.sizes });
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
      const r = await saveBudgetAndPreferencesStep({ budget: b, preferences: profile.preferences });
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
              onChange={(preferences) => setProfile({ ...profile, preferences })}
            />
          ))}
          <Actions busy={busy} onBack={() => go(2)} onSkip={() => go("session")} onContinue={saveStep3} continueLabel="Finish setup" />
        </Steps>
      )}
    </main>
  );
}
