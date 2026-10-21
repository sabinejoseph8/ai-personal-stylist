import { describe, expect, it } from "vitest";
import { stored } from "@/lib/photo-store";
import { storeBusy } from "@/lib/photos";

// The photo store tries again when Supabase's connection limit is full for a moment (Sabine's decision C
// in the Phase 3 code review), and only then.

const busy = { data: null, error: { message: "Too many connections issued to the database" } };
const done = { data: "ok", error: null };

describe("photo store requests", () => {
  it("are tried again while the store is busy, then succeed", async () => {
    const answers = [busy, busy, done];
    let calls = 0;
    expect(await stored(async () => answers[calls++])).toEqual(done);
    expect(calls).toBe(3);
  });

  it("give up after three tries, and never retry other errors", async () => {
    let calls = 0;
    expect(await stored(async () => (calls++, busy))).toEqual(busy);
    expect(calls).toBe(3);
    calls = 0;
    const missing = { data: null, error: { message: "Object not found" } };
    expect(await stored(async () => (calls++, missing))).toEqual(missing);
    expect(calls).toBe(1);
  });

  it("know the store's busy answers, from the server or in the browser", () => {
    expect(storeBusy("Too many connections issued to the database")).toBe(true);
    expect(storeBusy('{"statusCode":"500","error":"too many connections"}')).toBe(true);
    expect(storeBusy("The resource already exists")).toBe(false);
  });
});
