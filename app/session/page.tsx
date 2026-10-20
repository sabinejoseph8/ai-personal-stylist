import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StylingSession } from "@/components/session/styling-session";
import { buttonClasses } from "@/components/ui/button";
import { currentGuest } from "@/lib/guest";
import { describeBudget, describePreference } from "@/lib/profile";
import { loadProfile } from "@/lib/profile-store";
import { isIdle } from "@/lib/sessions";

// The styling session: the stylist stage (2a, 2b) and My Styling Notes (2c, 2d), with saved preferences
// such as "Never: high heels" at the top of the notebook (R5, R24). On desktops the stage sits in a
// 320 px stylist column and the notebook in the second (design 4.1, 5.6); looks come in Phase 4. What
// the profile says stays under the notebook until Profile and privacy arrives in Phase 6 (2d, Q2).
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
      <StylingSession openSessionId={resumable} initialNotes={notes} preferences={profile.preferences.map(describePreference)}>
        <section aria-labelledby="profile-title" className="flex flex-col gap-3">
          <h2 id="profile-title" className="type-subheading m-0">
            From your profile
          </h2>
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
        </section>
      </StylingSession>
    </main>
  );
}
