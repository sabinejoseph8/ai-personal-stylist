import type { Metadata } from "next";
import { AppBar } from "@/components/app-bar/app-bar";
import { redirect } from "next/navigation";
import { SavedLooks } from "@/components/saved/saved-looks";
import { currentGuest } from "@/lib/guest";
import { listSaved } from "@/lib/saved-looks-service";
import { serverKeyDb } from "@/lib/supabase/admin";
import { listWardrobe } from "@/lib/wardrobe-service";

// Saved looks (6a; R60, design 4 and 5.8): a list on phones, a grid on wider screens. Until the app
// menu (Phase 7), it's reached from the session page and the welcome-back screen.
export const metadata: Metadata = {
  title: "Saved looks · AI Personal Stylist",
};

export default async function SavedLooksPage() {
  const guest = await currentGuest();
  if (!guest) redirect("/");
  const db = serverKeyDb();
  const [looks, wardrobe] = await Promise.all([listSaved(db, guest.id), listWardrobe(db, guest.id).catch(() => [])]);
  // The shopper's own wardrobe pieces show their photos while they're in the wardrobe.
  const photos = Object.fromEntries(wardrobe.flatMap((w) => (w.thumbnailUrl ?? w.photoUrl ? [[w.id, (w.thumbnailUrl ?? w.photoUrl)!]] : [])));

  return (
    <>
    <AppBar current="saved" />
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 tablet:px-6 desktop:px-8">
      <h1 className="type-title m-0">Saved looks</h1>
      {/* Keyed on what's saved, so the page starts again from the server whenever it changes (tech spec 5, rule 11). */}
      <SavedLooks key={looks.map((l) => l.id).join(",")} initialLooks={looks} photos={photos} />
    </main>
    </>
  );
}
