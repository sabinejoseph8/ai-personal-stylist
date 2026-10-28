import Link from "next/link";
import { currentGuest } from "@/lib/guest";
import { AppMenu, type MenuKey } from "./app-menu";

// The app bar (7a, design 4: App bar and menu): the app's name, which goes to the start, and the menu.
// Rendered by each page, so it's always as fresh as the page under it (who's signed in, the bag's count).

export async function AppBar({ current }: { current?: MenuKey }) {
  const guest = await currentGuest();
  const bag = guest ? await guest.db.from("bag_items").select("id", { count: "exact", head: true }) : null;
  return (
    <header className="border-b border-hairline bg-page">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-1 tablet:px-6 desktop:px-8">
        <Link href="/" className="focus-ring type-label inline-flex min-h-touch items-center rounded-control text-ink">
          AI Personal Stylist
        </Link>
        <AppMenu guest={!!guest} current={current} bagCount={bag?.count ?? 0} />
      </div>
    </header>
  );
}
