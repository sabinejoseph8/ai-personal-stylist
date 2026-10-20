// What the page and the server agree on about photos (3a; R26, FR-27). The page checks a file's name
// and type before sending it, to answer at once; the server checks its contents, which decide.

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** Photos per session (Sabine's answer to Q3 in 3a). */
export const MAX_PHOTOS = 5;

export type PhotoSource = "upload" | "camera";
/** What the browser gets: short-lived links, never where the files are kept. */
export type ShownPhoto = { id: string; version: number; source: PhotoSource; active: boolean; photoUrl: string; thumbnailUrl: string };

export const PHOTO_MESSAGES = {
  type: "Use a JPEG, PNG, WebP or HEIC photo up to 10 MB.",
  size: "Use a JPEG, PNG, WebP or HEIC photo up to 10 MB.",
  unreadable: "That photo couldn't be opened. Try another one.",
  missing: "The photo didn't arrive. Check your connection and try again.",
  full: `You can add up to ${MAX_PHOTOS} photos. Remove one first.`,
  session: "This session has ended. Start a conversation to add a photo.",
  photo: "That photo has been removed.",
  tooMany: "You've added 10 photos in the last hour. Please wait a little, then try again.",
} as const;

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
