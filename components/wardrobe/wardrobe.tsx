"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icons";
import { PermissionCard } from "@/components/ui/permission-card";
import { Sheet } from "@/components/ui/sheet";
import { MAX_PHOTO_BYTES, PHOTO_MESSAGES, storeBusy, uploadType, whileStoreBusy } from "@/lib/photos";
import { CATEGORIES, CATEGORY_LABELS, type Category, DETAIL_LENGTHS, FILTERS, type Filter, type ShownWardrobeItem, WARDROBE_MESSAGES } from "@/lib/wardrobe";

// The Wardrobe page (3d; R36, R37, design 4.2 and 5.8): saved items as a photo grid with category
// filters. Add item uploads a photo, which is checked, cleaned and read like a session photo, and the
// photo reader suggests its details to check (Sabine's answer to Q1). Edit changes the details, Delete
// asks first. Select, then Style with these, chooses items for the session (Q2). With nothing ticked
// the button is Clear wardrobe items, so the session can stop using them (Sabine's decision B in 3e).

const inputClass = "focus-ring type-body min-h-touch w-full rounded-control border border-control-edge bg-page px-3 text-ink";
const FILTER_LABELS: Record<Filter, string> = { all: "All", ...CATEGORY_LABELS };

/** Sends the file to its one-time upload link, again if the store is busy for a moment. Resolves true when it arrived. */
async function sendFile(url: string, file: File, type: string) {
  const once = async () => {
    const res = await fetch(url, { method: "PUT", headers: { "content-type": type }, body: file }).catch(() => null);
    return { ok: !!res?.ok, busy: !!res && !res.ok && storeBusy(await res.text().catch(() => "")) };
  };
  return (await whileStoreBusy(once, (r) => r.busy)).ok;
}

function ItemForm({
  item,
  adding,
  onSaved,
  onDeleted,
}: {
  item: ShownWardrobeItem;
  /** A draft from Add item: Save adds it to the wardrobe. */
  adding: boolean;
  onSaved: (item: ShownWardrobeItem) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<Category>(item.category);
  const [details, setDetails] = useState(item.details);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setSaving(true);
    setProblem(null);
    const res = await fetch(`/api/wardrobe/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, details }),
    }).catch(() => null);
    const answer = (await res?.json().catch(() => ({}))) as { item?: ShownWardrobeItem; error?: string } | undefined;
    setSaving(false);
    if (res?.ok && answer?.item) onSaved(answer.item);
    else setProblem(answer?.error ?? WARDROBE_MESSAGES.saveFailed);
  }

  async function remove() {
    const res = await fetch(`/api/wardrobe/${item.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok || res?.status === 404) onDeleted();
    else setProblem(WARDROBE_MESSAGES.saveFailed);
  }

  // The same lengths the server allows (WardrobeEdit), so a long detail can't be turned away.
  const field = (key: keyof typeof details, label: string, max: number) => (
    <label className="flex flex-col gap-1">
      <span className="type-label text-ink">{label}</span>
      <input className={inputClass} value={details[key]} maxLength={max} onChange={(e) => setDetails({ ...details, [key]: e.target.value })} />
    </label>
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {item.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived private link
        <img src={item.photoUrl} alt={item.name} className="max-h-56 w-full rounded-image bg-showroom object-contain" />
      )}
      <label className="flex flex-col gap-1">
        <span className="type-label text-ink">Name</span>
        <input className={inputClass} value={name} required maxLength={120} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="type-label text-ink">Category</span>
        {/* Safari draws its own short dropdown, so it gets the same height as the other fields and its own arrow. */}
        <span className="relative block">
          <select className={`${inputClass} appearance-none pr-10`} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" size={20} strokeWidth={1.5} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-graphite" />
        </span>
      </label>
      {field("type", "Type", DETAIL_LENGTHS.type)}
      {field("colors", "Colors", DETAIL_LENGTHS.colors)}
      {field("pattern", "Pattern", DETAIL_LENGTHS.pattern)}
      {field("style", "Style", DETAIL_LENGTHS.style)}
      {problem && (
        <p role="alert" className="type-small m-0 text-red-pen">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="submit" disabled={saving}>
          {adding ? "Add to wardrobe" : "Save"}
        </Button>
        {!adding && (
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            trigger={<Button variant="secondary">Delete</Button>}
            title="Delete this item?"
            description="Its photo is deleted too. This can't be undone."
            confirmLabel="Delete item"
            cancelLabel="Keep it"
            destructive
            onConfirm={() => void remove()}
          />
        )}
      </div>
    </form>
  );
}

export function Wardrobe({ initialItems, photosAllowed }: { initialItems: ShownWardrobeItem[]; photosAllowed: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set(initialItems.filter((i) => i.styling).map((i) => i.id)));
  const [open, setOpen] = useState<{ item: ShownWardrobeItem; adding: boolean } | null>(null);
  const [allowed, setAllowed] = useState(photosAllowed);
  const [asking, setAsking] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  // Focus goes back to the item (or Add item) when its sheet closes.
  const returnTo = useRef<HTMLElement | null>(null);
  const openSheet = (item: ShownWardrobeItem, isAdding: boolean) => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen({ item, adding: isAdding });
  };
  const closeAndReturn = () => {
    setOpen(null);
    setTimeout(() => returnTo.current?.isConnected && returnTo.current.focus(), 0);
  };

  const shown = items.filter((i) => filter === "all" || i.category === filter);

  /** Add item: the permission card first (R36, R64), then the photo picker. */
  function addItem() {
    setProblem(null);
    if (!allowed) return setAsking(true);
    picker.current?.click();
  }

  async function upload(file: File) {
    const type = uploadType(file);
    if (!type || file.size > MAX_PHOTO_BYTES) return setProblem(PHOTO_MESSAGES.type);
    setAdding("Adding your item…");
    try {
      const res = await fetch("/api/wardrobe/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowPhotos: allowed }),
      });
      const started = (await res.json().catch(() => ({}))) as { id?: string; uploadUrl?: string; error?: string };
      if (!res.ok || !started.id || !started.uploadUrl) return setProblem(started.error ?? PHOTO_MESSAGES.missing);
      if (!(await sendFile(started.uploadUrl, file, type))) return setProblem(PHOTO_MESSAGES.missing);
      setAdding("Analyzing");
      const done = await fetch(`/api/wardrobe/uploads/${started.id}/ready`, { method: "POST" });
      const result = (await done.json().catch(() => ({}))) as { item?: ShownWardrobeItem; error?: string };
      if (!done.ok || !result.item) return setProblem(result.error ?? PHOTO_MESSAGES.missing);
      openSheet(result.item, true);
    } catch {
      setProblem(PHOTO_MESSAGES.missing);
    } finally {
      setAdding(null);
    }
  }

  /** Closing Add item without saving drops the draft. */
  function closeSheet() {
    if (open?.adding) void fetch(`/api/wardrobe/${open.item.id}`, { method: "DELETE" }).catch(() => null);
    closeAndReturn();
  }

  async function styleWithThese() {
    setProblem(null);
    setNotice(null);
    const res = await fetch("/api/wardrobe/styling", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    }).catch(() => null);
    if (!res?.ok) return setProblem(WARDROBE_MESSAGES.saveFailed);
    // Leaving the page: next time it opens out of Select (Next.js keeps this page's state while it's hidden).
    setSelecting(false);
    if (selected.size) return router.push("/session");
    // Clear wardrobe items: nothing from the wardrobe in My Styling Notes, and the stylist isn't told about any.
    setItems((list) => list.map((i) => ({ ...i, styling: false })));
    setNotice(WARDROBE_MESSAGES.cleared);
  }
  const styling = items.some((i) => i.styling);

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />

      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
            {FILTER_LABELS[f]}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {selecting ? (
          <>
            {selected.size || !styling ? (
              <Button icon="confirmed" disabled={!selected.size} onClick={() => void styleWithThese()}>
                Style with these
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void styleWithThese()}>
                Clear wardrobe items
              </Button>
            )}
            <Button variant="secondary" onClick={() => setSelecting(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button onClick={addItem} disabled={!!adding}>
              Add item
            </Button>
            {items.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setNotice(null);
                  setSelecting(true);
                }}
              >
                Select
              </Button>
            )}
          </>
        )}
      </div>

      {asking && (
        <PermissionCard
          permission="wardrobePhotos"
          state="ask"
          onAllow={() => {
            setAllowed(true);
            setAsking(false);
            picker.current?.click();
          }}
          onNotNow={() => setAsking(false)}
        />
      )}
      {adding && (
        <p role="status" className="type-body m-0 text-graphite">
          {adding}
        </p>
      )}
      {problem && <Banner tone="error" title={problem} />}
      {notice && (
        <p role="status" className="type-body m-0 text-ink">
          {notice}
        </p>
      )}

      {items.length === 0 && !adding ? (
        <p className="type-body m-0 text-graphite">{WARDROBE_MESSAGES.empty}</p>
      ) : (
        <ul aria-label="Your wardrobe" className="m-0 grid list-none grid-cols-2 gap-4 p-0 tablet:grid-cols-3 desktop:grid-cols-5">
          {shown.map((item) => {
            const picked = selected.has(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={selecting ? picked : undefined}
                  onClick={() =>
                    selecting
                      ? setSelected((s) => {
                          const next = new Set(s);
                          if (picked) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })
                      : openSheet(item, false)
                  }
                  className={`focus-ring flex w-full flex-col gap-2 rounded-panel border bg-page p-2 text-left ${
                    selecting && picked ? "border-emerald outline-2 outline-emerald" : "border-hairline"
                  }`}
                >
                  <span className="relative block aspect-square w-full overflow-hidden rounded-image bg-showroom">
                    {item.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- a short-lived private link
                      <img src={item.thumbnailUrl} alt="" className="h-full w-full object-contain" />
                    )}
                    {selecting && (
                      <span
                        aria-hidden="true"
                        className={`absolute right-2 top-2 grid size-7 place-items-center rounded-pill border-2 ${picked ? "border-emerald bg-emerald text-white" : "border-white bg-ink/40"}`}
                      >
                        {picked && <Icon name="confirmed" />}
                      </span>
                    )}
                  </span>
                  <span className="type-label text-ink">{item.name}</span>
                  <span className="type-small text-graphite">
                    {CATEGORY_LABELS[item.category]}
                    {item.styling && !selecting ? " · Styling with" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 && shown.length === 0 && <p className="type-body m-0 text-graphite">Nothing here yet.</p>}

      {open && (
        <Sheet trigger={<span hidden />} open onOpenChange={(o) => !o && closeSheet()} title={open.adding ? "Check the details" : "Edit item"}>
          <ItemForm
            key={open.item.id}
            item={open.item}
            adding={open.adding}
            onSaved={(saved) => {
              setItems((list) => (open.adding ? [saved, ...list] : list.map((i) => (i.id === saved.id ? saved : i))));
              closeAndReturn();
            }}
            onDeleted={() => {
              setItems((list) => list.filter((i) => i.id !== open.item.id));
              setSelected((s) => {
                const next = new Set(s);
                next.delete(open.item.id);
                return next;
              });
              closeAndReturn();
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
