import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileAndPrivacy } from "@/components/profile/profile-and-privacy";
import { buttonClasses } from "@/components/ui/button";
import { currentGuest } from "@/lib/guest";
import { describeBudget, describePreference } from "@/lib/profile";
import { loadProfile } from "@/lib/profile-store";

// Profile and privacy (6b; R63 to R66, design 5.8): four sections in this order: Your profile, Saved
// preferences, Permissions, Your data. Until the app menu (Phase 7), it's reached from the session page,
// the welcome-back screen and the saved preferences in My Styling Notes.
export const metadata: Metadata = {
  title: "Profile and privacy · AI Personal Stylist",
};

export default async function ProfilePage() {
  const guest = await currentGuest();
  if (!guest) redirect("/");
  const [profile, consents, wardrobe, open] = await Promise.all([
    loadProfile(guest.db, guest.id),
    guest.db.from("consents").select("wardrobe_photos_at, remember_preferences_at").maybeSingle(),
    guest.db.from("wardrobe_items").select("id", { count: "exact", head: true }).eq("draft", false),
    guest.db.from("sessions").select("id").in("status", ["active", "paused"]).maybeSingle(),
  ]);
  const sizes = Object.entries(profile.sizes)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${v}`);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 tablet:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="type-title m-0">Profile and privacy</h1>
        <Link href="/session" className={buttonClasses("quiet")}>
          Back to your session
        </Link>
      </div>
      <ProfileAndPrivacy
        key={[profile.preferences.map((p) => p.id).join(","), consents.data?.wardrobe_photos_at ?? "", consents.data?.remember_preferences_at ?? "", wardrobe.count ?? 0, open.data?.id ?? ""].join("|")}
        profile={{
          shopping: profile.departments.length ? profile.departments.join(" and ") : "Not set",
          style: profile.styleWords.length ? profile.styleWords.join(", ") : "Not set",
          sizes: sizes.length ? sizes.join(", ") : "Not set",
          budget: describeBudget(profile.budget) ?? "Not set",
        }}
        preferences={profile.preferences.flatMap((p) => (p.id ? [{ id: p.id, words: describePreference(p) }] : []))}
        wardrobePhotos={!!consents.data?.wardrobe_photos_at}
        savingPreferences={!!consents.data?.remember_preferences_at}
        wardrobeCount={wardrobe.count ?? 0}
        sessionOpen={!!open.data}
      />
    </main>
  );
}
