import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Wardrobe } from "@/components/wardrobe/wardrobe";
import { currentGuest } from "@/lib/guest";
import { serverKeyDb } from "@/lib/supabase/admin";
import { listWardrobe } from "@/lib/wardrobe-service";

// The Wardrobe page (3d; R37, design 5.8): the guest's saved items, and whether they've allowed
// wardrobe photos yet (R36, R64). Until the app menu (Phase 7), it's reached from the session page and
// the welcome-back screen (Sabine's answer to Q3 in 3d).
export const metadata: Metadata = {
  title: "Wardrobe · AI Personal Stylist",
};

export default async function WardrobePage() {
  const guest = await currentGuest();
  if (!guest) redirect("/");
  const [items, consents] = await Promise.all([
    // The server key, so drafts an Add item left behind can be tidied away with their photos.
    listWardrobe(serverKeyDb(), guest.id),
    guest.db.from("consents").select("wardrobe_photos_at").maybeSingle(),
  ]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 tablet:px-6 desktop:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="type-title m-0">Wardrobe</h1>
        <Link href="/session" className={buttonClasses("quiet")}>
          Back to your session
        </Link>
      </div>
      <Wardrobe initialItems={items} photosAllowed={!!consents.data?.wardrobe_photos_at} />
    </main>
  );
}
