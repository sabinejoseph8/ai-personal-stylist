import type { Metadata } from "next";
import Link from "next/link";
import { AppBar } from "@/components/app-bar/app-bar";
import { BehindTheScenes } from "@/components/behind/behind-the-scenes";
import { KeepingProvider } from "@/components/looks/keeping";
import { redirect } from "next/navigation";
import { StylingSession } from "@/components/session/styling-session";
import { buttonClasses } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";
import { currentGuest } from "@/lib/guest";
import { describeBudget, describePreference } from "@/lib/profile";
import { loadProfile } from "@/lib/profile-store";
import { listPhotos } from "@/lib/photos-service";
import { stylingItems } from "@/lib/wardrobe-service";
import { isIdle } from "@/lib/sessions";

// The styling session: the stylist stage (2a, 2b) and My Styling Notes (2c, 2d), with saved preferences
// such as "Never: high heels" at the top of the notebook (R5, R24), and the looks (4c). On desktops the
// stage sits in a 320 px stylist column, the notebook in the second and the looks in the third; on
// tablets the looks take the right-hand column (design 4.1, 5.5, 5.6). What the profile says stays
// under the notebook until Profile and privacy arrives in Phase 6 (2d, Q2).
export const metadata: Metadata = {
  title: "Your session · AI Personal Stylist",
};

export default async function SessionPage({ searchParams }: PageProps<"/session">) {
  // Behind the scenes from the menu on another page opens here (7a).
  const startBehind = (await searchParams).behind === "1";
  const guest = await currentGuest();
  if (!guest) redirect("/");
  const [profile, open, wardrobe, saved, bag] = await Promise.all([
    loadProfile(guest.db, guest.id),
    guest.db.from("sessions").select("id, last_activity_at").in("status", ["active", "paused"]).maybeSingle(),
    // Chosen with Style with these on the Wardrobe page (3d).
    stylingItems(guest.db, guest.id).catch(() => []),
    // Which looks are saved, and how many pieces are in the bag (6a): guests read their own.
    guest.db.from("saved_looks").select("items_key"),
    guest.db.from("bag_items").select("id", { count: "exact", head: true }),
  ]);
  const budget = describeBudget(profile.budget);
  // Within 30 minutes, the shopper can carry on the same session (R12).
  const resumable = open.data && !isIdle(open.data.last_activity_at) ? open.data.id : null;
  // A resumed session keeps its notes and photos (guests can read their own).
  const [notes, photos] = resumable
    ? await Promise.all([
        guest.db
          .from("session_notes")
          .select("id, kind, text:note_text, status")
          .eq("session_id", resumable)
          .eq("removed", false)
          .order("created_at")
          .then((r) => r.data ?? []),
        listPhotos(guest.db, guest.id, resumable).catch(() => []),
      ])
    : [[], []];

  return (
    <>
    <AppBar current="session" />
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 tablet:grid tablet:max-w-5xl tablet:grid-cols-2 tablet:items-start tablet:gap-x-8 tablet:px-6 desktop:max-w-7xl desktop:grid-cols-[320px_minmax(0,400px)_minmax(0,1fr)] desktop:gap-x-10 desktop:px-8">
      <h1 className="type-title m-0 tablet:col-span-2 desktop:col-span-3">Your styling session</h1>
      <ToastProvider>
      <KeepingProvider savedKeys={(saved.data ?? []).map((r) => r.items_key as string)} bagCount={bag.count ?? 0}>
      <StylingSession openSessionId={resumable} initialNotes={notes} initialPhotos={photos} wardrobe={wardrobe} preferences={profile.preferences.map(describePreference)}>
        <section aria-labelledby="profile-title" className="flex flex-col gap-3">
          <h2 id="profile-title" className="type-subheading m-0">
            From your profile
          </h2>
          <dl className="type-body m-0 grid grid-cols-[auto_minmax(0,1fr)] break-words gap-x-4 gap-y-1">
            <dt className="text-graphite">Shopping</dt>
            <dd className="m-0">{profile.departments.length ? profile.departments.join(" and ") : "Not set"}</dd>
            <dt className="text-graphite">Style</dt>
            <dd className="m-0">{profile.styleWords.length ? profile.styleWords.join(", ") : "Not set"}</dd>
            <dt className="text-graphite">Budget</dt>
            <dd className="m-0 price">{budget ?? "Not set"}</dd>
          </dl>
          {/* Wardrobe, Saved looks, the bag, Profile and privacy and Behind the scenes are in the app menu (7a). */}
          <Link href="/setup" className={buttonClasses("secondary", "self-start")}>
            Edit your profile
          </Link>
          {/* A portfolio extra (4d), opened from the menu. */}
          <BehindTheScenes startOpen={startBehind} />
          <p className="type-small m-0 text-graphite">Sample products only. Nothing here is for sale.</p>
        </section>
      </StylingSession>
      </KeepingProvider>
      </ToastProvider>
    </main>
    </>
  );
}
