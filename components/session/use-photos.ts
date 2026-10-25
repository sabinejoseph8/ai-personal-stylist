"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { readLines } from "@/components/session/use-notes";
import { changeItem, type ItemChange, type StyleItem } from "@/core/photos/item";
import { MAX_PHOTO_BYTES, PHOTO_MESSAGES, type PhotoSource, type ShownPhoto, storeBusy, uploadType, whileStoreBusy } from "@/lib/photos";

// The browser's side of the item to style around (3a; R26, R27, R31, R32). A picked photo shows at
// once from the shopper's own device, with progress while it uploads. The app gives a one-time upload
// link, the browser sends the photo straight to private storage, and the app checks and cleans it
// (Sabine's answer to Q1 in 3a). Every change shows at once and the server's answer then takes over.
// An answer for a photo that has since been replaced or removed is ignored, so it never comes back.
// Once kept, the photo reader's answer streams in on the same request (3b), and the shopper confirms
// details, picks one of several items and says whether it's theirs, each shown at once.

export type { ShownPhoto };

export type PagePhoto = {
  /** Stays the same through Replace, so the photo keeps its place. */
  key: string;
  /** The server's id, once it has one. */
  id: string | null;
  version: number;
  source: PhotoSource;
  active: boolean;
  state: "uploading" | "ready" | "failed";
  /** While uploading: the photo from the shopper's device. Then the kept photo's short-lived link. */
  photoUrl: string;
  thumbnailUrl: string;
  /** 0 to 1 while uploading. */
  progress: number;
  /** Kept for Try again (R32). */
  file?: File;
  /** What the photo reader made of it (3b), once the photo is kept. */
  item: StyleItem | null;
  /** Saved to the wardrobe (3d). */
  inWardrobe: boolean;
};

const fromServer = (p: ShownPhoto): PagePhoto => ({ ...p, key: p.id, state: "ready", progress: 1 });

/** The stream from .../ready: the kept photo first, then the photo reader's answer. */
type ReadyLine = { photo?: ShownPhoto; id?: string; version?: number; item?: StyleItem; context?: string; reason?: string; error?: string };

export type PhotoHooks = {
  /** What the stylist should now know (3b). */
  onContext: (context: string) => void;
  /** The photo reader has answered for a newly kept photo (its key), so the stylist can speak up (Q1 in 3b). */
  onRead: (key: string) => void;
};

/** Sends the file to its one-time upload link, again if the store is busy for a moment. Resolves true when it arrived. */
async function sendFile(url: string, file: File, type: string, onProgress: (share: number) => void) {
  const once = () =>
    new Promise<{ ok: boolean; busy: boolean }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("content-type", type);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        const ok = xhr.status >= 200 && xhr.status < 300;
        resolve({ ok, busy: !ok && storeBusy(xhr.responseText) });
      };
      xhr.onerror = () => resolve({ ok: false, busy: false });
      xhr.send(file);
    });
  return (await whileStoreBusy(once, (r) => r.busy)).ok;
}

/** Loads an image before it's shown, so swapping the preview for the kept photo doesn't flash. */
const preload = (url: string) =>
  new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });

export function usePhotos(sessionId: string | null, initial: ShownPhoto[], hooks: PhotoHooks) {
  const [photos, setPhotos] = useState<PagePhoto[]>(() => initial.map(fromServer));
  const [problem, setProblem] = useState<string | null>(null);
  // Photos whose reading the page asks the server for, rather than waiting for it on the upload.
  const [awaiting, setAwaiting] = useState(() => new Set(initial.map((p) => p.id)));
  const session = useRef(sessionId);
  const said = useRef(hooks);
  useLayoutEffect(() => {
    session.current = sessionId;
    said.current = hooks;
  });
  // Each upload has a ticket. A replaced or removed photo's ticket is withdrawn, so its late answers are ignored.
  const tickets = useRef(new Map<string, number>());
  const nextTicket = useRef(0);

  const update = (key: string, ticket: number, change: Partial<PagePhoto>) => {
    if (tickets.current.get(key) !== ticket) return false;
    setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...change } : p)));
    return true;
  };
  const drop = (key: string) => {
    tickets.current.delete(key);
    setPhotos((list) => {
      const gone = list.find((p) => p.key === key);
      if (gone?.photoUrl.startsWith("blob:")) URL.revokeObjectURL(gone.photoUrl);
      const rest = list.filter((p) => p.key !== key);
      // The newest kept photo left becomes the one to style around, as on the server.
      const newest = rest.findLast((p) => p.state === "ready")?.key;
      return gone?.active && newest ? rest.map((p) => ({ ...p, active: p.key === newest })) : rest;
    });
  };

  /**
   * Uploads a file as a new photo, or as a new version of `photo` (Replace, or Try again). A still from
   * the camera is "camera" (3c). Resolves as soon as the server has taken the photo, or refused it, while
   * the upload goes on: Capture waits for that before turning the camera off (review batch 5, D4).
   */
  function upload(file: File, photo?: PagePhoto, source: PhotoSource = photo?.source ?? "upload") {
    return new Promise<boolean>((accept) => {
      void run(file, photo, source, accept);
    });
  }

  async function run(file: File, photo: PagePhoto | undefined, source: PhotoSource, accept: (ok: boolean) => void) {
    setProblem(null);
    const type = uploadType(file);
    if (!type || file.size > MAX_PHOTO_BYTES) {
      setProblem(PHOTO_MESSAGES.type);
      accept(false);
      return;
    }
    const id = session.current;
    if (!id) {
      accept(false);
      return;
    }
    const key = photo?.key ?? crypto.randomUUID();
    const ticket = ++nextTicket.current;
    tickets.current.set(key, ticket);
    const preview = URL.createObjectURL(file);
    const shown: Partial<PagePhoto> = { state: "uploading", progress: 0, photoUrl: preview, thumbnailUrl: preview, file, source, item: null, inWardrobe: false };
    // A new photo becomes the one to style around only once it's kept, as on the server (review batch
    // 1): the earlier photo stays in use while this one uploads, and if the upload fails.
    setPhotos((list) => {
      if (photo) return list.map((p) => (p.key === key ? { ...p, ...shown } : p));
      const added: PagePhoto = { key, id: null, version: 0, active: false, ...(shown as Omit<PagePhoto, "key" | "id" | "version" | "active">) };
      return [...list, added];
    });
    if (photo?.photoUrl.startsWith("blob:")) URL.revokeObjectURL(photo.photoUrl);

    const failed = () => update(key, ticket, { state: "failed", progress: 0 });
    // A replacement the server turns away, for the file or for the hourly limit, leaves the original as it
    // was; a new photo goes (review batches 1 and 5, D2 and D7).
    const restore = async () => {
      if (!photo) return false;
      // Try again after a failed replacement: the tile no longer holds the original, but the server does (5d review).
      const from = photo.state === "ready" ? photo : await fromServer(photo.id);
      if (!from) return false;
      if (tickets.current.get(key) !== ticket) return true; // a newer attempt owns the tile
      URL.revokeObjectURL(preview);
      update(key, ticket, { state: "ready", progress: 1, photoUrl: from.photoUrl, thumbnailUrl: from.thumbnailUrl, version: from.version, file: undefined, source: from.source, item: from.item, inWardrobe: from.inWardrobe });
      return true;
    };
    const fromServer = async (photoId: string | null) => {
      if (!photoId) return null;
      const res = await fetch(`/api/sessions/${id}/assets`).catch(() => null);
      if (!res?.ok) return null;
      const { photos: fresh } = (await res.json().catch(() => ({ photos: [] }))) as { photos: ShownPhoto[] };
      return fresh.find((p) => p.id === photoId) ?? null;
    };
    try {
      const res = await fetch(`/api/sessions/${id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, replaces: photo?.id ?? null }),
      });
      const answer = (await res.json().catch(() => ({}))) as { id?: string; version?: number; uploadUrl?: string; error?: string };
      if (!res.ok || !answer.id || !answer.uploadUrl || !answer.version) {
        // Turned away (5 photos already, too many this hour, the session ended): it isn't added.
        accept(false);
        if (tickets.current.get(key) !== ticket) return;
        if (res.status >= 500 || !answer.error) failed();
        else {
          if (!(await restore())) drop(key);
          setProblem(answer.error);
        }
        return;
      }
      accept(true);
      if (!update(key, ticket, { id: answer.id, version: answer.version })) {
        // Removed while it was being added: the server's copy goes too.
        if (!tickets.current.has(key)) void fetch(`/api/sessions/${id}/assets/${answer.id}`, { method: "DELETE" }).catch(() => null);
        return;
      }

      const sent = await sendFile(answer.uploadUrl, file, type, (progress) => update(key, ticket, { progress: Math.min(progress, 0.95) }));
      if (!sent) {
        failed();
        return;
      }
      // Arrived: what's left is the server's check. Small uploads may not have reported progress.
      update(key, ticket, { progress: 0.95 });
      const done = await fetch(`/api/sessions/${id}/assets/${answer.id}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: answer.version }),
      });
      if (done.ok && done.body) {
        // The kept photo first (Analyzing), then the photo reader's answer.
        let kept = false;
        let read = false;
        try {
          await readLines<ReadyLine>(done, (line) => {
            if (line.photo && !kept) {
              kept = true;
              const p = line.photo;
              void preload(p.photoUrl).then(() => {
                if (update(key, ticket, { state: "ready", progress: 1, photoUrl: p.photoUrl, thumbnailUrl: p.thumbnailUrl, version: p.version, file: undefined }))
                  URL.revokeObjectURL(preview);
              });
              update(key, ticket, { item: p.item });
              // Kept: it's the one to style around now.
              // Only for the attempt that still owns the tile: a late line for a removed photo cleared every photo's Active (5d review).
              if (p.active && tickets.current.get(key) === ticket) setPhotos((list) => list.map((q) => ({ ...q, active: q.key === key })));
            } else if (line.item && update(key, ticket, { item: line.item })) {
              read = true;
              if (line.context) said.current.onContext(line.context);
              said.current.onRead(key);
            }
          });
        } catch {
          // The connection dropped after the photo was kept (a weak signal): the photo isn't lost.
        }
        if (!kept) failed();
        // The reading is saved on the server even so, so the page asks for it (Phase 3 code review).
        else if (!read && tickets.current.get(key) === ticket) setAwaiting((keys) => new Set(keys).add(key));
        return;
      }
      const result = (await done.json().catch(() => ({}))) as ReadyLine;
      if (tickets.current.get(key) !== ticket) return;
      if (result.reason === "type" || result.reason === "size" || result.reason === "unreadable" || result.reason === "photo") {
        // The server turned the file away. A replacement leaves the original as it was; a new photo goes.
        if (result.reason === "photo" || !(await restore())) drop(key);
        setProblem(result.error ?? PHOTO_MESSAGES.type);
      } else failed();
    } catch {
      accept(false);
      failed();
    }
  }

  /** Switch the active photo (R31): it shows at once, and goes back if the server says no. */
  async function choose(photo: PagePhoto) {
    const id = session.current;
    // Only a kept photo can be the item to style around (review batch 1).
    if (!id || !photo.id || photo.active || photo.state !== "ready") return;
    const before = photos;
    setPhotos((list) => list.map((p) => ({ ...p, active: p.key === photo.key })));
    const res = await fetch(`/api/sessions/${id}/assets/${photo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    }).catch(() => null);
    if (!res?.ok) {
      setPhotos(before);
      setProblem("That didn't save. Check your connection and try again.");
      return;
    }
    const { context } = (await res.json().catch(() => ({}))) as { context?: string };
    if (context) said.current.onContext(context);
  }

  /**
   * Confirm a detail, pick one of several items, or say whether it's the shopper's (R28 to R30). It
   * shows at once; the server's answer then takes over, or it goes back if it couldn't be saved.
   */
  // A change still on its way to the server: Save to wardrobe waits for it, so tapping Save straight
  // after It's mine doesn't reach the server first (found by the 3d browser tests).
  // Each change passes on the item as it left it, so a quick second tap starts from the first one's
  // result rather than from the photo as it was when tapped (Phase 3 code review).
  type Changed = { id: string; version: number; item: StyleItem } | null;
  const changing = useRef<Promise<Changed>>(Promise.resolve(null));
  function change(photo: PagePhoto, what: { confirm: ItemChange["confirm"] } | { choose: number } | { ownership: "owned" | "inspiration" }) {
    const done = changing.current.then((last) => sendChange(photo, what, last));
    changing.current = done.catch(() => null);
    return done;
  }

  async function sendChange(
    photo: PagePhoto,
    what: { confirm: ItemChange["confirm"] } | { choose: number } | { ownership: "owned" | "inspiration" },
    last: Changed,
  ): Promise<Changed> {
    setProblem(null);
    const id = session.current;
    if (!id || !photo.id || !photo.item) return null;
    const before = last && last.id === photo.id && last.version === photo.version ? last.item : photo.item;
    const local: ItemChange = "confirm" in what ? { confirm: what.confirm } : what;
    setItem(photo.id, changeItem(before, local));
    const body = "confirm" in what ? { confirm: what.confirm?.[0] } : what;
    const res = await fetch(`/api/sessions/${id}/assets/${photo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const answer = res?.ok ? ((await res.json().catch(() => ({}))) as { item?: StyleItem; context?: string }) : null;
    if (!answer?.item) {
      setItem(photo.id, before);
      setProblem("That didn't save. Check your connection and try again.");
      return { id: photo.id, version: photo.version, item: before };
    }
    setItem(photo.id, answer.item);
    if (answer.context) said.current.onContext(answer.context);
    return { id: photo.id, version: photo.version, item: answer.item };
  }

  /**
   * Save to wardrobe (3d, R36). "permission" means the shopper hasn't allowed wardrobe photos yet: the
   * page asks, then saves again with `allow`.
   */
  async function saveToWardrobe(photo: PagePhoto, allow = false): Promise<"saved" | "permission" | "failed"> {
    setProblem(null);
    if (!photo.id) return "failed";
    await changing.current;
    const res = await fetch("/api/wardrobe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPhoto: photo.id, allowPhotos: allow }),
    }).catch(() => null);
    const answer = (await res?.json().catch(() => ({}))) as { reason?: string; error?: string } | undefined;
    if (res?.ok) {
      setPhotos((list) => list.map((p) => (p.key === photo.key ? { ...p, inWardrobe: true } : p)));
      return "saved";
    }
    if (answer?.reason === "permission") return "permission";
    setProblem(answer?.error ?? "That didn't save. Check your connection and try again.");
    return "failed";
  }

  /** A photo's item as the server now has it, from a change by touch or by voice (3b). */
  function setItem(photoId: string, item: StyleItem) {
    setPhotos((list) => list.map((p) => (p.id === photoId && p.state === "ready" ? { ...p, item } : p)));
  }

  /** Remove (R31). A photo the server never had is simply dropped. */
  async function remove(photo: PagePhoto) {
    setProblem(null);
    const id = session.current;
    drop(photo.key);
    if (!id || !photo.id) return;
    const res = await fetch(`/api/sessions/${id}/assets/${photo.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok && res?.status !== 404) setProblem("That photo couldn't be removed. Check your connection and try again.");
    const { context } = res?.ok ? ((await res.json().catch(() => ({}))) as { context?: string }) : {};
    if (context) said.current.onContext(context);
  }

  /** Fresh links and items for the session's photos. */
  async function fetchPhotos() {
    const id = session.current;
    if (!id) return;
    const res = await fetch(`/api/sessions/${id}/assets`).catch(() => null);
    if (!res?.ok) return;
    const { photos: fresh } = (await res.json()) as { photos: ShownPhoto[] };
    const latest = new Map(fresh.map((p) => [p.id, p]));
    setPhotos((list) =>
      list.map((p) => {
        const f = p.id && p.state === "ready" ? latest.get(p.id) : undefined;
        // Active and saved-to-wardrobe come from the server too: back from the Wardrobe page after deleting
        // the saved item, the photo still said "Saved to your wardrobe" (full code review, D6).
        return f && f.version === p.version ? { ...p, photoUrl: f.photoUrl, thumbnailUrl: f.thumbnailUrl, item: f.item, active: f.active, inWardrobe: f.inWardrobe } : p;
      }),
    );
  }

  /** Links last 30 minutes: when one has run out, the page asks for fresh ones. */
  const refreshing = useRef(false);
  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      await fetchPhotos();
    } finally {
      // At most once a minute, so a photo that won't load doesn't ask over and over.
      setTimeout(() => (refreshing.current = false), 60_000);
    }
  }

  // A photo still being read with no answer on its way to this page looks again shortly: one being
  // read when the page opened (a reload mid-reading), or one whose answer was cut off by the connection.
  const waitingForReading = photos.some((p) => awaiting.has(p.key) && p.state === "ready" && p.item?.reading.state === "analyzing");
  useEffect(() => {
    if (!waitingForReading) return;
    const timer = setTimeout(() => void fetchPhotos(), 4000);
    return () => clearTimeout(timer);
  }, [waitingForReading, photos]);

  return {
    photos,
    active: photos.find((p) => p.active) ?? photos.at(-1) ?? null,
    problem,
    add: (file: File, source: PhotoSource = "upload") => upload(file, undefined, source),
    replace: (photo: PagePhoto, file: File) => void upload(file, photo, "upload"),
    retry: (photo: PagePhoto) => photo.file && void upload(photo.file, photo),
    choose: (photo: PagePhoto) => void choose(photo),
    remove: (photo: PagePhoto) => void remove(photo),
    confirm: (photo: PagePhoto, detail: NonNullable<ItemChange["confirm"]>[number]) => void change(photo, { confirm: [detail] }),
    chooseItem: (photo: PagePhoto, index: number) => void change(photo, { choose: index }),
    setOwnership: (photo: PagePhoto, ownership: "owned" | "inspiration") => void change(photo, { ownership }),
    /** A change heard in the shopper's words (3b). */
    setItem,
    saveToWardrobe,
    refresh: () => void refresh(),
    /** End clears the photos with the notes. */
    reset: () => {
      tickets.current.clear();
      setPhotos((list) => {
        for (const p of list) if (p.photoUrl.startsWith("blob:")) URL.revokeObjectURL(p.photoUrl);
        return [];
      });
      setProblem(null);
    },
  };
}
