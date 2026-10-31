"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { useBehindTheScenesRequests } from "@/components/app-bar/live";
import { Sheet } from "@/components/ui/sheet";
import type { Entry, EntryKind } from "@/core/looks/behind";

// Behind the scenes (4d, R72, design 4.4): a portfolio extra that shows, in plain words, what the
// stylist captured and how each look was checked. Closed until opened (Sabine's answer to Q2 in 4d), from
// the app menu (7a), or at once when the session page is opened from the menu elsewhere. A sheet on phones, a side panel on
// desktops. While open, it asks again as the notes and looks change. The session page passes it the
// session and a sign of what changed, through BehindTheScenesSource.

const Source = createContext<{ sessionId: string | null; changes: string }>({ sessionId: null, changes: "" });

export function BehindTheScenesSource({ sessionId, changes, children }: { sessionId: string | null; changes: string; children: ReactNode }) {
  return <Source value={{ sessionId, changes }}>{children}</Source>;
}

/** Icons for the entries that are a check's result; words carry the meaning (design 3.7). */
const ICON: Partial<Record<EntryKind, { name: IconName; tone: string }>> = {
  passed: { name: "checked", tone: "text-emerald" },
  blocked: { name: "error", tone: "text-red-pen" },
  recheck: { name: "needsNewCheck", tone: "text-graphite" },
  revision: { name: "revising", tone: "text-emerald" },
};

const time = (entry: Entry) => (entry.kind === "products" ? "Now" : new Date(entry.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));

export function BehindTheScenes({ startOpen = false }: { startOpen?: boolean }) {
  const { sessionId, changes } = useContext(Source);
  const [open, setOpen] = useState(startOpen);
  // The ?behind=1 that opened it from another page's menu is dropped once it has opened, so a reload (the
  // Chrome microphone safety net, say) doesn't open it again after it was closed (Phase 7 review).
  useEffect(() => {
    if (startOpen && window.location.search) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [startOpen]);
  // Each Behind the scenes in the menu opens it.
  const requests = useBehindTheScenesRequests();
  const [seenRequests, setSeenRequests] = useState(requests);
  if (requests !== seenRequests) {
    setSeenRequests(requests);
    setOpen(true);
  }
  const [entries, setEntries] = useState<{ session: string; list: Entry[] } | null>(null);
  const [problem, setProblem] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The session whose entries are shown: a ref, so an answer arriving doesn't ask again (4e review).
  const shownFor = useRef<string | null>(null);

  // Asked when opened, and again shortly after each change while open.
  useEffect(() => {
    if (!open || !sessionId) return;
    let current = true;
    const timer = setTimeout(
      () =>
        void fetch(`/api/sessions/${sessionId}/behind-the-scenes`, { cache: "no-store" })
          .then((res) => (res.ok ? (res.json() as Promise<{ entries: Entry[] }>) : Promise.reject(new Error(String(res.status)))))
          .then((body) => {
            if (!current) return;
            shownFor.current = sessionId;
            setEntries({ session: sessionId, list: body.entries });
            setProblem(false);
          })
          .catch(() => current && setProblem(true)),
      shownFor.current === sessionId ? 800 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, sessionId, changes, attempt]);

  const list = entries && entries.session === sessionId ? entries.list : null;
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Behind the scenes" side>
      <p className="type-small m-0 text-graphite">What the stylist captured and how each look was checked, from this session&apos;s records. No audio, words, video or photos are kept.</p>
      {!sessionId && <p className="type-body m-0 text-ink">Start a conversation, and what the stylist captures and checks appears here.</p>}
      {sessionId && problem && !list && (
        <div className="flex flex-col items-start gap-2">
          <p className="type-body m-0 text-ink">Behind the scenes couldn&apos;t be loaded.</p>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}
      {sessionId && !list && !problem && <p className="type-body m-0 text-graphite">Loading…</p>}
      {list && (
        <ol aria-label="Entries, newest first" className="m-0 flex list-none flex-col p-0">
          {list.map((entry, i) => {
            const icon = ICON[entry.kind];
            return (
              <li key={`${entry.at}-${i}`} className="flex gap-2 border-b border-hairline py-3 last:border-b-0">
                {icon && <Icon name={icon.name} className={`mt-0.5 shrink-0 ${icon.tone}`} />}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="type-small text-graphite">{time(entry)}</span>
                  <p className="type-body m-0 text-ink">{entry.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Sheet>
  );
}
