import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoBag } from "@/components/bag/demo-bag";
import { buttonClasses } from "@/components/ui/button";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { listBag } from "@/lib/bag-service";
import { currentGuest } from "@/lib/guest";
import { serverKeyDb } from "@/lib/supabase/admin";

// The demo bag (6a; R61, R62, design 4 and 5.8): one column with the demo banner on top, and the total
// and the disabled Checkout at the bottom, pinned on phones.
export const metadata: Metadata = {
  title: "Demo bag · AI Personal Stylist",
};

export default async function BagPage() {
  const guest = await currentGuest();
  if (!guest) redirect("/");
  const db = serverKeyDb();
  const items = await listBag({ db, catalog: createSampleCatalog(db) }, guest.id);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 tablet:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="type-title m-0">Demo bag</h1>
        <Link href="/session" className={buttonClasses("quiet")}>
          Back to your session
        </Link>
      </div>
      <DemoBag key={items.map((i) => `${i.id}:${i.size}`).join(",")} initialItems={items} />
    </main>
  );
}
