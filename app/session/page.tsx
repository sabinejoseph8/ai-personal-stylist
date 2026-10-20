import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotebookPage } from "@/components/notebook/notebook-page";
import { buttonClasses } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { currentGuest } from "@/lib/guest";
import { describeBudget, describePreference } from "@/lib/profile";
import { loadProfile } from "@/lib/profile-store";

// Placeholder until Phase 2 builds the styling session. It shows what the stylist will know,
// including saved preferences such as "Never: high heels" (R5, R24).
export const metadata: Metadata = { title: "Your session · AI Personal Stylist" };

export default async function SessionPage() {
  const guest = await currentGuest();
  if (!guest) redirect("/");
  const profile = await loadProfile(guest.db, guest.id);
  const budget = describeBudget(profile.budget);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 tablet:px-6">
      <h1 className="type-title m-0">Your stylist is coming next</h1>
      <p className="type-body m-0 text-graphite">
        The live styling session is being built now. Here&apos;s what your stylist will already know about you.
      </p>
      <NotebookPage title="Your saved preferences">
        {profile.preferences.length === 0 && (
          <li className="type-body pl-[calc(var(--margin-x)+0.75rem)] pr-4 italic text-graphite">No saved preferences yet.</li>
        )}
        {profile.preferences.map((p) => (
          <li key={`${p.kind}-${p.words}`} className="flex min-h-7 items-center justify-between gap-3 pl-[calc(var(--margin-x)+0.75rem)] pr-4">
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
    </main>
  );
}
