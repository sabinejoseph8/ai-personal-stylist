import type { Metadata } from "next";
import { AppBar } from "@/components/app-bar/app-bar";
import { redirect } from "next/navigation";
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
    <>
    <AppBar current="wardrobe" />
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 tablet:px-6 desktop:px-8">
      <h1 className="type-title m-0">Wardrobe</h1>
      {/* Next.js keeps a page's state when the shopper navigates away and back (Activity). Keying on the
          saved items makes the page start again from what's saved whenever that changes (tech spec 5, rule
          11): after Style with these and Change, it showed the old choice (Sabine's iPhone check in 3e).
          Photo links are left out of the key, since they're new on every visit. */}
      <Wardrobe
        key={JSON.stringify(items.map((i) => [i.id, i.name, i.category, i.details, i.styling]))}
        initialItems={items}
        photosAllowed={!!consents.data?.wardrobe_photos_at}
      />
    </main>
    </>
  );
}
