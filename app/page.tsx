import { headers } from "next/headers";
import Link from "next/link";
import { NoteLine, NotebookPage } from "@/components/notebook/notebook-page";
import { buttonClasses } from "@/components/ui/button";
import { StartDemo } from "@/components/welcome/start-demo";
import { currentGuest } from "@/lib/guest";
import { describeBudget, describePreference, isEmpty } from "@/lib/profile";
import { loadProfile } from "@/lib/profile-store";

// The welcome screen (R1, design 5.1), or "Welcome back" for a returning guest (R3).

const HERO_NOTES = [
  { id: "1", text: "Outdoor wedding, November", status: "confirmed" as const },
  { id: "2", text: "Elegant", status: "to_confirm" as const },
  { id: "3", text: "Emerald green, preferred", status: "to_confirm" as const },
  { id: "4", text: "Budget: up to $500", status: "to_confirm" as const },
];

function SmallPrint() {
  return <p className="type-small m-0 text-graphite">Sample products only. Nothing here is for sale.</p>;
}

async function WelcomeBack({ guest }: { guest: NonNullable<Awaited<ReturnType<typeof currentGuest>>> }) {
  const profile = await loadProfile(guest.db, guest.id);
  const empty = isEmpty(profile);
  const lines = [
    profile.departments.length ? `Shopping ${profile.departments.join(" and ")}` : null,
    profile.styleWords.length ? profile.styleWords.join(", ") : null,
    describeBudget(profile.budget) ? `Budget: ${describeBudget(profile.budget)!.toLowerCase()}` : null,
    ...profile.preferences.map(describePreference),
  ].filter(Boolean) as string[];

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10 tablet:px-6">
      <h1 className="type-title m-0">Welcome back</h1>
      <p className="type-body m-0 text-graphite">
        {empty ? "You started a demo in this browser. Pick up where you left off." : "Here's what your stylist knows about you."}
      </p>
      {!empty && (
        <ul className="m-0 flex list-none flex-col gap-1 rounded-panel border border-hairline bg-page p-4">
          {lines.map((l) => (
            <li key={l} className="type-body">
              {l}
            </li>
          ))}
        </ul>
      )}
      <dl className="type-small m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-graphite">
        <dt>Wardrobe</dt>
        <dd className="m-0">Empty</dd>
        <dt>Saved looks</dt>
        <dd className="m-0">None yet</dd>
        <dt>Demo bag</dt>
        <dd className="m-0">Empty</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Link href={empty ? "/setup" : "/session"} className={buttonClasses("primary")}>
          Continue
        </Link>
        <Link href="/setup" className={buttonClasses("secondary")}>
          Edit your profile
        </Link>
      </div>
      <SmallPrint />
    </main>
  );
}

export default async function Home() {
  const guest = await currentGuest();
  if (guest) return <WelcomeBack guest={guest} />;
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 tablet:px-6 desktop:grid-cols-2 desktop:grid-rows-[auto_1fr] desktop:gap-x-12 desktop:px-8 desktop:py-16">
      <div className="flex flex-col gap-5 desktop:col-start-1 desktop:row-start-1">
        <p className="type-label m-0 text-graphite">AI Personal Stylist</p>
        <h1 className="type-display m-0">Say what you need. Watch your stylist take notes.</h1>
        <p className="type-body m-0 max-w-[60ch] text-graphite">
          Talk with a lifelike stylist, show what you own, and refine complete looks by voice or touch.
        </p>
      </div>
      <NotebookPage className="w-full max-w-md justify-self-center desktop:col-start-2 desktop:row-span-2 desktop:row-start-1 desktop:self-center">
        {HERO_NOTES.map((n, i) => (
          <NoteLine key={n.id} note={n} inkIn delayMs={300 + i * 700} />
        ))}
      </NotebookPage>
      <div className="flex flex-col gap-4 desktop:col-start-1 desktop:row-start-2">
        <StartDemo nonce={nonce} />
        <Link href="/about" className="type-label self-start text-emerald underline underline-offset-2">
          How it was built
        </Link>
        <SmallPrint />
      </div>
    </main>
  );
}
