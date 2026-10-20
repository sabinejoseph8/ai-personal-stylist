import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotebookPage } from "@/components/notebook/notebook-page";
import { StylistStage } from "@/components/session/stylist-stage";
import { buttonClasses } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { currentGuest } from "@/lib/guest";
import { describeBudget, describePreference } from "@/lib/profile";
import { loadProfile } from "@/lib/profile-store";
import { isIdle } from "@/lib/sessions";

// The styling session: the stylist stage (2a, 2b), and what the stylist already knows, including saved
// preferences such as "Never: high heels" (R5, R24). On desktops the stage sits in a 320 px stylist
// column (design 4.1, 5.6); My Styling Notes takes the second column in 2d, and looks come in Phase 4.
export const metadata: Metadata = {
  title: "Your session · AI Personal Stylist",
};

export default async function SessionPage() {
  const guest = await currentGuest();
  if (!guest) redirect("/");
  const [profile, open] = await Promise.all([
    loadProfile(guest.db, guest.id),
    guest.db.from("sessions").select("id, last_activity_at").in("status", ["active", "paused"]).maybeSingle(),
  ]);
  const budget = describeBudget(profile.budget);
  // Within 30 minutes, the shopper can carry on the same session (R12).
  const resumable = open.data && !isIdle(open.data.last_activity_at) ? open.data.id : null;
  // A resumed session keeps its notes (guests can read their own).
  const notes = resumable
    ? ((
        await guest.db
          .from("session_notes")
          .select("id, kind, text:note_text, status")
          .eq("session_id", resumable)
          .eq("removed", false)
          .order("created_at")
      ).data ?? [])
    : [];

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 tablet:px-6 desktop:grid desktop:max-w-5xl desktop:grid-cols-[320px_minmax(0,440px)] desktop:items-start desktop:gap-x-12 desktop:px-8">
      <h1 className="type-title m-0 desktop:col-span-2">Your styling session</h1>
      <StylistStage openSessionId={resumable} initialNotes={notes} />
      <div className="flex flex-col gap-6">
        <p className="type-body m-0 text-graphite">Here&apos;s what your stylist already knows about you.</p>
        <NotebookPage title="Your saved preferences">
          {profile.preferences.length === 0 && (
            <li className="type-body pl-[calc(var(--margin-x)+0.75rem)] pr-4 italic text-graphite">No saved preferences yet.</li>
          )}
          {profile.preferences.map((p) => (
            <li
              key={`${p.kind}-${p.words}`}
              className="flex min-h-7 items-center justify-between gap-3 pl-[calc(var(--margin-x)+0.75rem)] pr-4"
            >
              <span className="type-note text-ink">{describePreference(p)}</span>
              <StatusChip status="savedPreference" label={p.kind === "likes" ? "Guides choices" : "Firm rule"} />
            </li>
          ))}
        </NotebookPage>
        <dl className="type-body m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-graphite">Shopping</dt>
          <dd className="m-0">{profile.departments.length ? profile.departments.join(" and ") : "Not set"}</dd>
          <dt className="text-graphite">Style</dt>
          <dd className="m-0">{profile.styleWords.length ? profile.styleWords.join(", ") : "Not set"}</dd>
          <dt className="text-graphite">Budget</dt>
          <dd className="m-0 price">{budget ?? "Not set"}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Link href="/setup" className={buttonClasses("secondary")}>
            Edit your profile
          </Link>
          <Link href="/" className={buttonClasses("quiet")}>
            Back to the start
          </Link>
        </div>
        <p className="type-small m-0 text-graphite">Sample products only. Nothing here is for sale.</p>
      </div>
    </main>
  );
}
