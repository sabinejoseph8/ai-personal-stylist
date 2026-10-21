// What the page and the server agree on about photos (3a; R26, FR-27). The page checks a file's name
// and type before sending it, to answer at once; the server checks its contents, which decide.

import type { StyleItem } from "@/core/photos/item";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** Photos per session (Sabine's answer to Q3 in 3a). */
export const MAX_PHOTOS = 5;

export type PhotoSource = "upload" | "camera";
/** What the browser gets: short-lived links, never where the files are kept, and what the photo reader made of it (3b). */
export type ShownPhoto = {
  id: string;
  version: number;
  source: PhotoSource;
  active: boolean;
  photoUrl: string;
  thumbnailUrl: string;
  item: StyleItem;
  /** Already saved to the wardrobe (3d). */
  inWardrobe: boolean;
};

export const PHOTO_MESSAGES = {
  type: "Use a JPEG, PNG, WebP or HEIC photo up to 10 MB.",
  size: "Use a JPEG, PNG, WebP or HEIC photo up to 10 MB.",
  unreadable: "That photo couldn't be opened. Try another one.",
  missing: "The photo didn't arrive. Check your connection and try again.",
  full: `You can add up to ${MAX_PHOTOS} photos. Remove one first.`,
  session: "This session has ended. Start a conversation to add a photo.",
  photo: "That photo has been removed.",
  unread: "Couldn't recognize this item. Describe it instead.",
  tooMany: "You've added 10 photos in the last hour. Please wait a little, then try again.",
} as const;

/**
 * The photo store sometimes turns a request away for a moment when Supabase's connection limit is full
 * ("Too many connections"). Only bursts of test traffic fill it, but the tests share the project with
 * the live site, so every request to the store, from the server or the browser, is tried again shortly
 * (Sabine's decision C in the Phase 3 code review).
 */
export const storeBusy = (message: string) => /too many connections|max_client_conn/i.test(message);
/**
 * Waits before each new try: about 4 seconds in all. A busy spell can outlast a second (GitHub's run of
 * the 3e fix had a test upload turned away for longer).
 */
const STORE_WAITS_MS = [500, 1000, 2500];

/** A photo store request, tried up to 3 more times while `busy` says the store turned it away for a moment. */
export async function whileStoreBusy<T>(request: () => PromiseLike<T>, busy: (result: T) => boolean | PromiseLike<boolean>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const result = await request();
    if (attempt >= STORE_WAITS_MS.length || !(await busy(result))) return result;
    await new Promise((r) => setTimeout(r, STORE_WAITS_MS[attempt]));
  }
}

const TYPES: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/heic": "image/heic",
  "image/heif": "image/heic",
};

/** The type to send a file as, or null when its name and type say it isn't an accepted photo. */
export function uploadType(file: { name: string; type: string }): string | null {
  if (TYPES[file.type]) return TYPES[file.type];
  // Some browsers don't know HEIC, and leave the type empty.
  if (!file.type && /\.(heic|heif)$/i.test(file.name)) return "image/heic";
  return null;
}
