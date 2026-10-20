import "server-only";
import sharp from "sharp";
import { MAX_PHOTO_BYTES } from "@/lib/photos";

// Every photo is checked and cleaned on the server before it's kept (FR-27, 3a). Its type comes from
// its contents, never its name. It's turned the right way up, shrunk, and saved again as a JPEG,
// which leaves out location and camera details. HEIC photos (the iPhone's own format) are converted
// first, because the image library can't read them.

const LONGEST_SIDE = 1600;
const THUMBNAIL_SIDE = 320;
/** About 100 megapixels: more than any phone photo, less than a file built to exhaust memory. */
const MAX_PIXELS = 100_000_000;

export type PhotoType = "jpeg" | "png" | "webp" | "heic";
export type PhotoRefusal = "type" | "size" | "unreadable";
export type CleanPhoto = { photo: Buffer; thumbnail: Buffer };

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

/** The photo's real type, from its first bytes, or null when it isn't an accepted photo. */
export function photoType(bytes: Uint8Array): PhotoType | null {
  const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (text(0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  if (text(4, 8) === "ftyp" && HEIC_BRANDS.has(text(8, 12))) return "heic";
  return null;
}

async function decodeHeic(bytes: Buffer) {
  const { default: decode } = await import("heic-decode");
  const { width, height, data } = await decode({ buffer: bytes });
  if (width * height > MAX_PIXELS) throw new Error("photo too large");
  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
}

/** The cleaned photo and its thumbnail, or why the file was turned away. */
export async function cleanPhoto(bytes: Buffer): Promise<CleanPhoto | { refused: PhotoRefusal }> {
  if (bytes.length > MAX_PHOTO_BYTES) return { refused: "size" };
  const type = photoType(bytes);
  if (!type) return { refused: "type" };
  try {
    const image = type === "heic" ? await decodeHeic(bytes) : sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "error" });
    // sharp keeps no metadata unless asked to, so the JPEG it writes has no location or camera details.
    // A see-through background turns white rather than black.
    const photo = await image
      .rotate()
      .resize(LONGEST_SIDE, LONGEST_SIDE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const thumbnail = await sharp(photo)
      .resize(THUMBNAIL_SIDE, THUMBNAIL_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return { photo, thumbnail };
  } catch {
    return { refused: "unreadable" };
  }
}
