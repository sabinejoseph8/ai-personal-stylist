import { describe, expect, it } from "vitest";
import { crc32, zip } from "@/lib/zip";

// Download my data's ZIP (6b, Sabine's answer to Q1): stored entries, read back here as a ZIP reader would.

/** The files in a ZIP, read from its central directory. */
function unzip(file: Uint8Array) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const end = file.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(file.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true);
    const data = file.subarray(start, start + size);
    expect(crc32(data)).toBe(view.getUint32(at + 16, true));
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLength;
  }
  return out;
}

describe("the data download's ZIP", () => {
  it("has the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("holds each file by its path, whole", () => {
    const enc = new TextEncoder();
    const file = zip([
      { path: "data.json", data: enc.encode('{"a":1}') },
      { path: "photos/wardrobe/é.jpg", data: enc.encode("not really a photo") },
    ]);
    expect(unzip(file)).toEqual({ "data.json": '{"a":1}', "photos/wardrobe/é.jpg": "not really a photo" });
    expect(unzip(zip([]))).toEqual({});
  });
});
