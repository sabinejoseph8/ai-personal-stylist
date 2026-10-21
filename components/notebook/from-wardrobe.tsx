import Link from "next/link";
import { CATEGORY_LABELS, type ShownWardrobeItem } from "@/lib/wardrobe";

// From your wardrobe (3d, Sabine's answer to Q2): the items chosen with Style with these, in My Styling
// Notes after Style around this item. The stylist is told about them, and Phase 4's looks use them.

const ROW = "pl-[calc(var(--margin-x)+0.75rem)] pr-4";

export function FromYourWardrobe({ items }: { items: ShownWardrobeItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="from-wardrobe" className="flex flex-col">
      <div className={`${ROW} flex items-center justify-between gap-3`}>
        <h3 id="from-wardrobe" className="type-heading m-0 leading-7 text-ink">
          From your wardrobe
        </h3>
        <Link href="/wardrobe" className="focus-ring type-label -my-2 inline-flex min-h-touch items-center rounded-control px-3 text-emerald hover:bg-emerald-wash">
          Change
        </Link>
      </div>
      <ul className={`${ROW} m-0 flex list-none flex-wrap gap-3 p-0 py-2`}>
        {items.map((item) => (
          <li key={item.id} className="flex w-20 flex-col items-center gap-1 text-center">
            {item.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived private link
              <img src={item.thumbnailUrl} alt="" className="size-14 rounded-print bg-page object-contain shadow-photo" />
            )}
            <span className="type-small text-ink">{item.name}</span>
            <span className="sr-only">{CATEGORY_LABELS[item.category]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
