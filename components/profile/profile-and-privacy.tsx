"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

// Profile and privacy (6b; R63 to R66, design 5.8). Your profile, with Edit your profile. Saved
// preferences, each with Delete. Permissions: the microphone and camera are the browser's, so the page
// says how to change them; wardrobe photos and saving preferences are the app's, and turning one off
// deletes what it covered (Sabine's answers to Q2 and Q3). Your data: Clear this session's notes,
// Download my data (a ZIP, Q1) and Delete all my data, which returns to the welcome screen (S19).

const NOT_NOW = "That didn't work. Check your connection and try again.";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-3 rounded-panel border border-hairline bg-page p-4">
      <h2 id={`${id}-title`} className="type-subheading m-0">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A button that asks first, then calls the server; `done` runs once it worked. */
function Confirmed({
  label,
  title,
  description,
  confirmLabel,
  destructive = true,
  variant = "secondary",
  disabled,
  run,
  done,
  onProblem,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  variant?: "secondary" | "destructive" | "quiet" | "primary";
  disabled?: boolean;
  run: () => Promise<Response | null>;
  done: () => void;
  onProblem: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmDialog
      trigger={
        <Button variant={variant} disabled={disabled || busy}>
          {label}
        </Button>
      }
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      destructive={destructive}
      onConfirm={async () => {
        setBusy(true);
        const res = await run().catch(() => null);
        setBusy(false);
        if (res?.ok) done();
        else onProblem(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? NOT_NOW);
      }}
    />
  );
}

export function ProfileAndPrivacy({
  profile,
  preferences,
  wardrobePhotos,
  savingPreferences,
  wardrobeCount,
  sessionOpen,
}: {
  profile: { shopping: string; style: string; sizes: string; budget: string };
  preferences: { id: string; words: string }[];
  wardrobePhotos: boolean;
  savingPreferences: boolean;
  wardrobeCount: number;
  sessionOpen: boolean;
}) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [allowing, setAllowing] = useState(false);
  const refresh = () => router.refresh();
  const permission = (which: "wardrobePhotos" | "savingPreferences", on: boolean) =>
    fetch("/api/me/permissions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ which, on }) });

  async function allow(which: "wardrobePhotos" | "savingPreferences") {
    setAllowing(true);
    setProblem(null);
    const res = await permission(which, true).catch(() => null);
    setAllowing(false);
    if (res?.ok) refresh();
    else setProblem(NOT_NOW);
  }

  const state = (on: boolean) => <span className="type-label text-ink">{on ? "Allowed" : "Not allowed"}</span>;

  return (
    <div className="flex flex-col gap-6">
      {problem && (
        <p role="alert" className="type-body m-0 rounded-control bg-red-wash p-3 text-ink">
          {problem}
        </p>
      )}

      <Section id="your-profile" title="Your profile">
        <dl className="type-body m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-graphite">Shopping</dt>
          <dd className="m-0">{profile.shopping}</dd>
          <dt className="text-graphite">Style</dt>
          <dd className="m-0">{profile.style}</dd>
          <dt className="text-graphite">Sizes</dt>
          <dd className="m-0">{profile.sizes}</dd>
          <dt className="text-graphite">Budget</dt>
          <dd className="m-0 price">{profile.budget}</dd>
        </dl>
        <Link href="/setup" className={buttonClasses("secondary", "self-start")}>
          Edit your profile
        </Link>
      </Section>

      <Section id="saved-preferences" title="Saved preferences">
        {preferences.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {preferences.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-2">
                <span className="type-body text-ink">{p.words}</span>
                <Confirmed
                  label="Delete"
                  variant="quiet"
                  title={`Delete "${p.words}"?`}
                  description="Later sessions won't use it. A session that's open now keeps its looks until they're next checked."
                  confirmLabel="Delete preference"
                  run={() => fetch(`/api/preferences/${p.id}`, { method: "DELETE" })}
                  done={refresh}
                  onProblem={setProblem}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body m-0 text-graphite">No saved preferences</p>
        )}
      </Section>

      <Section id="permissions" title="Permissions">
        <div className="flex flex-col gap-1">
          <h3 className="type-label m-0">Microphone</h3>
          <p className="type-body m-0 text-graphite">
            The stylist needs it to hear you. Your browser asks when you start a conversation. To change it on an iPhone: Settings, Apps, Safari, Microphone.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="type-label m-0">Camera</h3>
          <p className="type-body m-0 text-graphite">
            Used only while you show an item, and never recorded. Your browser asks the first time you tap Camera. To change it on an iPhone: Settings, Apps, Safari, Camera.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="type-label m-0">Wardrobe photos {state(wardrobePhotos)}</h3>
          <p className="type-body m-0 text-graphite">Keeps photos of items you save to your wardrobe, so you can style with them in later sessions.</p>
          {wardrobePhotos ? (
            <Confirmed
              label="Turn off"
              title="Turn off wardrobe photos?"
              description={wardrobeCount ? `Your ${wardrobeCount} wardrobe ${wardrobeCount === 1 ? "item and its photo are" : "items and their photos are"} deleted. This can't be undone.` : "No more photos are kept for your wardrobe."}
              confirmLabel={wardrobeCount ? "Turn off and delete" : "Turn off"}
              run={() => permission("wardrobePhotos", false)}
              done={refresh}
              onProblem={setProblem}
            />
          ) : (
            <Button variant="secondary" className="self-start" disabled={allowing} onClick={() => void allow("wardrobePhotos")}>
              Allow wardrobe photos
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="type-label m-0">Saving preferences {state(savingPreferences)}</h3>
          <p className="type-body m-0 text-graphite">Keeps your Must have, Never and Likes for later sessions. Saving them in setup allows it.</p>
          {savingPreferences ? (
            <Confirmed
              label="Turn off"
              title="Turn off saving preferences?"
              description={preferences.length ? `Your ${preferences.length} saved ${preferences.length === 1 ? "preference is" : "preferences are"} deleted. This can't be undone.` : "No preferences are kept for later sessions."}
              confirmLabel={preferences.length ? "Turn off and delete" : "Turn off"}
              run={() => permission("savingPreferences", false)}
              done={refresh}
              onProblem={setProblem}
            />
          ) : (
            <Button variant="secondary" className="self-start" disabled={allowing} onClick={() => void allow("savingPreferences")}>
              Allow saving preferences
            </Button>
          )}
        </div>
      </Section>

      <Section id="your-data" title="Your data">
        <div className="flex flex-col gap-2">
          <p className="type-body m-0 text-graphite">
            Notes, feedback and anything allowed for this session only are deleted when a session ends. Audio, the words you say and camera video are never kept.
          </p>
          {cleared ? (
            <p role="status" className="type-body m-0 text-ink">
              This session&apos;s notes are cleared.
            </p>
          ) : (
            <Confirmed
              label="Clear this session's notes"
              title="Clear this session's notes?"
              description="Every note and piece of feedback in this session goes. Your saved preferences stay."
              confirmLabel="Clear notes"
              disabled={!sessionOpen}
              run={() => fetch("/api/me/session-notes", { method: "DELETE" })}
              done={() => setCleared(true)}
              onProblem={setProblem}
            />
          )}
          {!sessionOpen && <p className="type-small m-0 text-graphite">No session is open now.</p>}
        </div>
        <div className="flex flex-col gap-2">
          <a href="/api/me/export" download className={buttonClasses("secondary", "self-start")}>
            Download my data
          </a>
          <p className="type-small m-0 text-graphite">A ZIP file with your data and your photos.</p>
        </div>
        <Confirmed
          label="Delete all my data"
          variant="destructive"
          title="Delete all your data?"
          description="Your profile, preferences, wardrobe, saved looks, bag and this session are deleted, and you start again from the welcome screen. This can't be undone."
          confirmLabel="Delete all data"
          run={() => fetch("/api/me", { method: "DELETE" })}
          // A full load, so nothing the browser held about the deleted guest stays on screen (S19).
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          done={() => window.location.assign("/")}
          onProblem={setProblem}
        />
      </Section>
    </div>
  );
}
