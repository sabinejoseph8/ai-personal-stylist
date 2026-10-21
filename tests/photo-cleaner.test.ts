import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cleanPhoto, photoType } from "@/lib/photo-cleaner";
import { photoAnnouncement } from "@/lib/notebook";
import { MAX_PHOTO_BYTES, uploadType } from "@/lib/photos";

// 3a: every photo is checked from its contents and cleaned before it's kept (R26, FR-27). Phase 3
// automated test: a renamed non-image file and a file over 10 MB are turned away, and saved photos
// carry no location data.

const pixels = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#0b6b4f" } });

/** A phone photo with its camera and location details in it. */
const phonePhoto = () =>
  pixels(400, 300)
    .withExif({
      IFD0: { Make: "TestPhone", Model: "TestPhone 15 Pro" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 3230/100", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 4366/100" },
    })
    .jpeg()
    .toBuffer();

const cleaned = async (bytes: Buffer) => {
  const result = await cleanPhoto(bytes);
  if ("refused" in result) throw new Error(`refused: ${result.refused}`);
  return result;
};

describe("photo type from contents", () => {
  it("knows JPEG, PNG, WebP and HEIC from their first bytes", async () => {
    expect(photoType(await pixels(4, 4).jpeg().toBuffer())).toBe("jpeg");
    expect(photoType(await pixels(4, 4).png().toBuffer())).toBe("png");
    expect(photoType(await pixels(4, 4).webp().toBuffer())).toBe("webp");
    expect(photoType(readFileSync("tests/fixtures/photo.heic"))).toBe("heic");
  });

  it("doesn't take a name's word for it: text is text, whatever the file is called", () => {
    expect(photoType(Buffer.from("Shopping list: blazer, shoes"))).toBeNull();
    expect(photoType(Buffer.from("GIF89a"))).toBeNull();
    expect(photoType(new Uint8Array())).toBeNull();
  });
});

describe("cleaning a photo", () => {
  it("turns away a renamed text file and a file over 10 MB", async () => {
    expect(await cleanPhoto(Buffer.from("Shopping list: blazer, shoes"))).toEqual({ refused: "type" });
    const big = Buffer.concat([await pixels(4, 4).jpeg().toBuffer(), Buffer.alloc(MAX_PHOTO_BYTES)]);
    expect(await cleanPhoto(big)).toEqual({ refused: "size" });
  });

  it("turns away a file that starts like a photo but isn't one", async () => {
    expect(await cleanPhoto(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("not really a photo")]))).toEqual({ refused: "unreadable" });
  });

  it("keeps no location or camera details", async () => {
    const original = await phonePhoto();
    const before = await sharp(original).metadata();
    expect(before.exif?.includes("TestPhone")).toBe(true);
    // The GPS section's tag (34853), in either byte order.
    expect(before.exif?.includes(Buffer.from([0x88, 0x25])) || before.exif?.includes(Buffer.from([0x25, 0x88]))).toBe(true);

    const { photo, thumbnail } = await cleaned(original);
    for (const file of [photo, thumbnail]) {
      const after = await sharp(file).metadata();
      expect(after.format).toBe("jpeg");
      expect(after.exif).toBeUndefined();
      expect(after.xmp).toBeUndefined();
      expect(file.includes("TestPhone")).toBe(false);
    }
  });

  it("turns a sideways phone photo the right way up", async () => {
    const sideways = await pixels(200, 100).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const after = await sharp((await cleaned(sideways)).photo).metadata();
    expect([after.width, after.height]).toEqual([100, 200]);
    expect(after.orientation).toBeUndefined();
  });

  it("shrinks a big photo to 1600 px on its longest side, keeping its shape, and makes a thumbnail", async () => {
    const { photo, thumbnail } = await cleaned(await pixels(3200, 2400).jpeg().toBuffer());
    const big = await sharp(photo).metadata();
    expect([big.width, big.height]).toEqual([1600, 1200]);
    const small = await sharp(thumbnail).metadata();
    expect([small.width, small.height]).toEqual([320, 240]);
  });

  it("never enlarges a small photo", async () => {
    const after = await sharp((await cleaned(await pixels(300, 500).png().toBuffer())).photo).metadata();
    expect([after.width, after.height]).toEqual([300, 500]);
  });

  it("gives a see-through PNG a white background, not black", async () => {
    const clear = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const { data } = await sharp((await cleaned(clear)).photo).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(245);
  });

  it("converts an iPhone HEIC photo to JPEG", async () => {
    const { photo } = await cleaned(readFileSync("tests/fixtures/photo.heic"));
    const after = await sharp(photo).metadata();
    expect(after.format).toBe("jpeg");
    expect([after.width, after.height]).toEqual([120, 80]);
  });

  it("turns away a HEIC photo bigger than the pixel limit, checked before it's decoded (3e)", async () => {
    // The fixture is 120 × 80: a lower limit stands in for a file that claims to be enormous.
    expect(await cleanPhoto(readFileSync("tests/fixtures/photo.heic"), 120 * 80 - 1)).toEqual({ refused: "unreadable" });
    expect("refused" in (await cleanPhoto(readFileSync("tests/fixtures/photo.heic"), 120 * 80))).toBe(false);
  });
});

describe("what the page checks before sending", () => {
  it("accepts JPEG, PNG, WebP and HEIC by type, and HEIC by name when the browser doesn't know it", () => {
    expect(uploadType({ name: "jacket.jpg", type: "image/jpeg" })).toBe("image/jpeg");
    expect(uploadType({ name: "jacket.png", type: "image/png" })).toBe("image/png");
    expect(uploadType({ name: "jacket.webp", type: "image/webp" })).toBe("image/webp");
    expect(uploadType({ name: "IMG_0001.HEIC", type: "image/heic" })).toBe("image/heic");
    expect(uploadType({ name: "IMG_0001.heif", type: "image/heif" })).toBe("image/heic");
    expect(uploadType({ name: "IMG_0001.HEIC", type: "" })).toBe("image/heic");
  });

  it("turns away other files at once", () => {
    expect(uploadType({ name: "jacket.gif", type: "image/gif" })).toBeNull();
    expect(uploadType({ name: "notes.txt", type: "text/plain" })).toBeNull();
    expect(uploadType({ name: "notes", type: "" })).toBeNull();
  });
});

describe("what screen readers hear about photos (R68)", () => {
  const p = (key: string, state: "uploading" | "ready" | "failed", active = true) => ({ key, state, active });

  it("says when a photo is added, ready, replaced, failed or removed", () => {
    expect(photoAnnouncement([], [p("a", "uploading")])).toBe("Photo added.");
    expect(photoAnnouncement([p("a", "uploading")], [p("a", "ready")])).toBe("Photo ready.");
    expect(photoAnnouncement([p("a", "ready")], [p("a", "uploading")])).toBe("Photo replaced.");
    expect(photoAnnouncement([p("a", "uploading")], [p("a", "failed")])).toBe("The photo didn't upload. Use Try again to send it again.");
    expect(photoAnnouncement([p("a", "ready")], [])).toBe("Photo removed.");
  });

  it("says which photo is active when there are several", () => {
    const before = [p("a", "ready", false), p("b", "ready", true)];
    expect(photoAnnouncement(before, [p("a", "ready", true), p("b", "ready", false)])).toBe("Now styling around photo 1 of 2.");
    expect(photoAnnouncement(before, [p("a", "ready", true)])).toBe("Photo removed.");
    expect(photoAnnouncement([...before, p("c", "ready", false)], [p("a", "ready", true), p("c", "ready", false)])).toBe(
      "Photo removed. Now styling around photo 1 of 2.",
    );
  });

  it("says nothing when nothing changed", () => {
    expect(photoAnnouncement([p("a", "ready")], [p("a", "ready")])).toBe("");
  });
});
