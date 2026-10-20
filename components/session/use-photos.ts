"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { MAX_PHOTO_BYTES, PHOTO_MESSAGES, type PhotoSource, type ShownPhoto, uploadType } from "@/lib/photos";

// The browser's side of the item to style around (3a; R26, R27, R31, R32). A picked photo shows at
// once from the shopper's own device, with progress while it uploads. The app gives a one-time upload
// link, the browser sends the photo straight to private storage, and the app checks and cleans it
// (Sabine's answer to Q1 in 3a). Every change shows at once and the server's answer then takes over.
// An answer for a photo that has since been replaced or removed is ignored, so it never comes back.

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
};

const fromServer = (p: ShownPhoto): PagePhoto => ({ ...p, key: p.id, state: "ready", progress: 1 });

/** Sends the file to its one-time upload link. Resolves true when it arrived. */
function sendFile(url: string, file: File, type: string, onProgress: (share: number) => void) {
  return new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

/** Loads an image before it's shown, so swapping the preview for the kept photo doesn't flash. */
const preload = (url: string) =>
  new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });

export function usePhotos(sessionId: string | null, initial: ShownPhoto[]) {
  const [photos, setPhotos] = useState<PagePhoto[]>(() => initial.map(fromServer));
  const [problem, setProblem] = useState<string | null>(null);
  const session = useRef(sessionId);
  useLayoutEffect(() => {
    session.current = sessionId;
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
      // The newest photo left becomes the one to style around, as on the server.
      return gone?.active && rest.length ? rest.map((p, i) => ({ ...p, active: i === rest.length - 1 })) : rest;
    });
  };

  /** Uploads a file as a new photo, or as a new version of `photo` (Replace, or Try again). */
  async function upload(file: File, photo?: PagePhoto) {
    setProblem(null);
    const type = uploadType(file);
    if (!type || file.size > MAX_PHOTO_BYTES) {
      setProblem(PHOTO_MESSAGES.type);
      return;
    }
    const id = session.current;
    if (!id) return;
    const key = photo?.key ?? crypto.randomUUID();
    const ticket = ++nextTicket.current;
    tickets.current.set(key, ticket);
    const preview = URL.createObjectURL(file);
    const shown: Partial<PagePhoto> = { state: "uploading", progress: 0, photoUrl: preview, thumbnailUrl: preview, file, source: "upload" };
    setPhotos((list) => {
      if (photo) return list.map((p) => (p.key === key ? { ...p, ...shown } : p));
      const added: PagePhoto = { key, id: null, version: 0, active: true, ...(shown as Omit<PagePhoto, "key" | "id" | "version" | "active">) };
      return [...list.map((p) => ({ ...p, active: false })), added];
    });
    if (photo?.photoUrl.startsWith("blob:")) URL.revokeObjectURL(photo.photoUrl);

    const failed = () => update(key, ticket, { state: "failed", progress: 0 });
    try {
      const res = await fetch(`/api/sessions/${id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "upload", replaces: photo?.id ?? null }),
      });
      const answer = (await res.json().catch(() => ({}))) as { id?: string; version?: number; uploadUrl?: string; error?: string };
      if (!res.ok || !answer.id || !answer.uploadUrl || !answer.version) {
        // Turned away (5 photos already, too many this hour, the session ended): it isn't added.
        if (tickets.current.get(key) !== ticket) return;
        if (res.status >= 500 || !answer.error) failed();
        else {
          drop(key);
          setProblem(answer.error);
        }
        return;
      }
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
      const result = (await done.json().catch(() => ({}))) as { photo?: ShownPhoto; reason?: string; error?: string };
      if (tickets.current.get(key) !== ticket) return;
      if (done.ok && result.photo) {
        const kept = result.photo;
        await preload(kept.photoUrl);
        if (update(key, ticket, { state: "ready", progress: 1, photoUrl: kept.photoUrl, thumbnailUrl: kept.thumbnailUrl, version: kept.version, file: undefined }))
          URL.revokeObjectURL(preview);
      } else if (result.reason === "type" || result.reason === "size" || result.reason === "unreadable" || result.reason === "photo") {
        // The server turned the file away, and removed it.
        drop(key);
        setProblem(result.error ?? PHOTO_MESSAGES.type);
      } else failed();
    } catch {
      failed();
    }
  }

  /** Switch the active photo (R31): it shows at once, and goes back if the server says no. */
  async function choose(photo: PagePhoto) {
    const id = session.current;
    if (!id || !photo.id || photo.active) return;
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
    }
  }

  /** Remove (R31). A photo the server never had is simply dropped. */
  async function remove(photo: PagePhoto) {
    setProblem(null);
    const id = session.current;
    drop(photo.key);
    if (!id || !photo.id) return;
    const res = await fetch(`/api/sessions/${id}/assets/${photo.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok && res?.status !== 404) setProblem("That photo couldn't be removed. Check your connection and try again.");
  }

  /** Links last 30 minutes: when one has run out, the page asks for fresh ones. */
  const refreshing = useRef(false);
  async function refresh() {
    const id = session.current;
    if (!id || refreshing.current) return;
    refreshing.current = true;
    try {
      const res = await fetch(`/api/sessions/${id}/assets`);
      if (!res.ok) return;
      const { photos: fresh } = (await res.json()) as { photos: ShownPhoto[] };
      const links = new Map(fresh.map((p) => [p.id, p]));
      setPhotos((list) =>
        list.map((p) => {
          const f = p.id && p.state === "ready" ? links.get(p.id) : undefined;
          return f && f.version === p.version ? { ...p, photoUrl: f.photoUrl, thumbnailUrl: f.thumbnailUrl } : p;
        }),
      );
    } finally {
      // At most once a minute, so a photo that won't load doesn't ask over and over.
      setTimeout(() => (refreshing.current = false), 60_000);
    }
  }

  return {
    photos,
    active: photos.find((p) => p.active) ?? photos.at(-1) ?? null,
    problem,
    add: (file: File) => void upload(file),
    replace: (photo: PagePhoto, file: File) => void upload(file, photo),
    retry: (photo: PagePhoto) => photo.file && void upload(photo.file, photo),
    choose: (photo: PagePhoto) => void choose(photo),
    remove: (photo: PagePhoto) => void remove(photo),
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
