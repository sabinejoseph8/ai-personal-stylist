import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ask } from "@/core/ask";
import { createCameraReader, type Sighting, sightingFrom } from "@/core/camera/reader";
import { agreed, asksToCapture, CAPTURE_GRACE_MS, cameraForStylist, nextSeen, type Seen, seenLabel, whenToCapture } from "@/core/camera/sightings";
import { createBudgetGuard, readBudgetLimits } from "@/lib/budget-guard";
import { readFrame, readQuietly } from "@/lib/camera-service";
import { withinLimit } from "@/lib/rate-limits";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 3c: the camera (R33 to R35). Two frames in a row must agree before an item is named (tech spec 4.4),
// "use this one" is heard by plain code (Sabine's answer to Q1 in 3c), the stylist is told what's on
// camera, and a frame is read through the budget guard and thrown away.

const blazer = (sure = true, color = "navy"): Sighting => ({ kind: "item", name: "Navy wool blazer", type: "blazer", color, sure });
const tote: Sighting = { kind: "item", name: "Black quilted tote", type: "bag", color: "black", sure: true };
const several: Sighting = { kind: "several" };
const none: Sighting = { kind: "none" };

describe("the camera reader's answer", () => {
  it("is one item, several items, or nothing", () => {
    expect(sightingFrom({ s: "one", n: " Navy wool blazer ", t: "Blazer", c: "Navy", k: "h" })).toEqual(blazer());
    expect(sightingFrom({ s: "one", n: "Navy wool blazer", t: "blazer", c: "navy", k: "m" })).toEqual(blazer(false));
    expect(sightingFrom({ s: "several", n: "", t: "", c: "", k: "l" })).toEqual(several);
    expect(sightingFrom({ s: "none", n: "", t: "", c: "", k: "l" })).toEqual(none);
    // An item without a name or type is nothing.
    expect(sightingFrom({ s: "one", n: "", t: "blazer", c: "navy", k: "h" })).toEqual(none);
  });

  it("gives no sighting, quietly, when the reader throws (full code review, batch 5, D8)", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readQuietly({ read: async () => { throw new Error("Claude unreachable"); } }, "abc")).toEqual({ sighting: null, costUsd: 0 });
    expect(quiet).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });

  it("sends Claude the frame, and gives no sighting but still the cost when Claude can't answer", async () => {
    const asked: Parameters<Ask>[0][] = [];
    const ask: Ask = async (request) => {
      asked.push(request);
      return { data: null, costUsd: 0.0002 };
    };
    expect(await createCameraReader(ask).read("abc")).toEqual({ sighting: null, costUsd: 0.0002 });
    expect(asked[0].user).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "abc" } },
      { type: "text", text: "What is being shown?" },
    ]);
  });
});

describe("naming what's on camera", () => {
  it("names an item only when two frames in a row agree on its type and color", () => {
    expect(agreed(null, blazer())).toBeNull();
    expect(agreed(blazer(), blazer())).toEqual(blazer());
    expect(agreed(blazer(true, "dark navy"), blazer(true, "navy"))).not.toBeNull();
    expect(agreed(blazer(), blazer(true, "black"))).toBeNull();
    // Phase 0 saw a tote called a "quilted jacket" on one frame: one odd frame names nothing.
    expect(agreed(tote, blazer())).toBeNull();
    expect(agreed(several, several)).toEqual({ kind: "several" });
    expect(agreed(none, none)).toBeNull();
  });

  it("is only sure when both frames were sure, and shows a question mark otherwise", () => {
    const seen = agreed(blazer(false), blazer()) as Seen;
    expect(seen).toMatchObject({ sure: false });
    expect(seenLabel(seen)).toBe("Navy wool blazer?");
    expect(seenLabel(blazer() as Seen)).toBe("Navy wool blazer");
    expect(seenLabel({ kind: "several" })).toBe("Several items");
  });

  it("tells the stylist about a new item once, drops the question mark when sure, and clears after two empty frames", () => {
    let step = nextSeen(null, blazer(false), blazer(false));
    expect(step).toEqual({ shown: { ...blazer(false) }, news: true });
    step = nextSeen(step.shown, blazer(false), blazer(false));
    expect(step.news).toBe(false);
    step = nextSeen(step.shown, blazer(true), blazer(true));
    expect(step).toEqual({ shown: blazer(true), news: false });
    // A different item is news again.
    expect(nextSeen(step.shown, tote, tote)).toEqual({ shown: tote, news: true });
    // One empty frame keeps the name; two clear it.
    expect(nextSeen(step.shown, blazer(), none)).toEqual({ shown: step.shown, news: false });
    expect(nextSeen(step.shown, none, none)).toEqual({ shown: null, news: true });
  });
});

describe("'use this one'", () => {
  it("is heard in the ways people say it", () => {
    for (const words of ["Use this one", "OK, use that one please", "capture it", "Can you take a picture", "This one.", "Use this.", "use this 1", "Capture"]) expect(asksToCapture(words)).toBe(true);
  });
  it("hears only clear requests, not everyday words (Sabine's decision A in 3e)", () => {
    for (const words of ["I'd use that for work", "I'm not sure about this one", "Does this one come in black?", "This one is a bit too long for me"])
      expect(asksToCapture(words)).toBe(false);
    // A short phrase counts once the words are final: it may be the start of a longer sentence.
    expect(asksToCapture("This one", false)).toBe(false);
    expect(asksToCapture("This one", true)).toBe(true);
    expect(asksToCapture("Use this one", false)).toBe(true);
  });
  it("forgives how speech recognition writes it: punctuation, capitals and a misheard first word (Sabine's decision D in 3e)", () => {
    for (const words of ["Use, this one.", "USE THIS ONE!", "Juice this one.", "Yes, this one", "OK, that one please", "That one."]) expect(asksToCapture(words)).toBe(true);
    expect(asksToCapture("Juice this one", false)).toBe(false);
  });
  it("counts for a few seconds after the name clears, and waits for a name said just before it appears (found on Sabine's iPhone in 3c)", () => {
    const now = 100_000;
    expect(whenToCapture(now, { on: true, itemShown: true, lastItemAt: 0 })).toBe("now");
    // Holding an item up while talking, two unclear frames can clear the name just as the shopper speaks.
    expect(whenToCapture(now, { on: true, itemShown: false, lastItemAt: now - 3000 })).toBe("now");
    expect(whenToCapture(now, { on: true, itemShown: false, lastItemAt: now - CAPTURE_GRACE_MS - 1 })).toBe("wait");
    expect(whenToCapture(now, { on: true, itemShown: false, lastItemAt: 0 })).toBe("wait");
    expect(whenToCapture(now, { on: false, itemShown: false, lastItemAt: now })).toBe("no");
  });

  it("isn't heard in other words", () => {
    for (const words of ["I love this jacket", "One more thing", "Is it useful?", "something like this"]) expect(asksToCapture(words)).toBe(false);
  });
});

describe("what the stylist is told about the camera", () => {
  it("names the item and asks her to say it, or to ask which, or to suggest a photo", () => {
    expect(cameraForStylist(null)).toBe("");
    expect(cameraForStylist({ seen: null, blocked: false })).toContain("about to hold up an item");
    expect(cameraForStylist({ seen: blazer(false) as Seen, blocked: false })).toBe(
      `On the shopper's camera now: Navy wool blazer (you're not sure). Name it out loud in a few words, ask about anything you're unsure of, and tell them to tap Capture or say "use this one" to add it to their notes.`,
    );
    expect(cameraForStylist({ seen: { kind: "several" }, blocked: false })).toContain("Ask which one they mean");
    expect(cameraForStylist({ seen: null, blocked: true })).toContain("Suggest uploading a photo instead");
  });
});

describe.skipIf(!canRunDatabaseTests)("a camera frame on the server", () => {
  const db = serverDb();
  let a: TestGuest;
  let b: TestGuest;
  let session: string;
  const frame = () => sharp({ create: { width: 640, height: 480, channels: 3, background: "#1f2a44" } }).jpeg({ quality: 70 }).toBuffer();
  const guard = (dailyAiUsd = 1) =>
    createBudgetGuard(db, { ...readBudgetLimits({}), dailyAiUsd, monthlyClaudeUsd: 1e6, monthlyOpenaiUsd: 1e6, monthlyVideoSeconds: 1e9 });
  const seenFrames: string[] = [];
  const reader = { read: async (jpeg: string) => (seenFrames.push(jpeg), { sighting: blazer(), costUsd: 0.0002 }) };

  beforeAll(async () => {
    [a, b] = await Promise.all([createTestGuest(), createTestGuest()]);
  }, 30_000);
  beforeEach(async () => {
    await db.from("sessions").delete().eq("user_id", a.id).throwOnError();
    await db.from("usage").delete().eq("user_id", a.id).throwOnError();
    session = (await db.from("sessions").insert({ user_id: a.id, status: "active" }).select("id").single().throwOnError()).data!.id;
    seenFrames.length = 0;
  });
  afterAll(async () => {
    await Promise.all([a?.remove(), b?.remove()]);
  });

  it("is read through the budget guard, and nothing is kept", async () => {
    expect(await readFrame({ db, guard: guard(), reader }, a.id, session, await frame())).toEqual({ ok: true, sighting: blazer() });
    expect(seenFrames).toHaveLength(1);
    const usage = await db.from("usage").select("claude_microdollars").eq("user_id", a.id).single().throwOnError();
    expect(usage.data!.claude_microdollars).toBe(200);
    expect((await db.from("session_assets").select("id").eq("session_id", session)).data).toEqual([]);
    expect(((await db.storage.from("guest-photos").list(a.id)).data ?? []).filter((f) => f.id)).toEqual([]);
  });

  it("a failed reading is still charged to the AI allowance (3e)", async () => {
    const failing = { read: async () => ({ sighting: null, costUsd: 0.0003 }) };
    expect(await readFrame({ db, guard: guard(), reader: failing }, a.id, session, await frame())).toEqual({ ok: false, reason: "failed" });
    const usage = await db.from("usage").select("claude_microdollars").eq("user_id", a.id).single().throwOnError();
    expect(usage.data!.claude_microdollars).toBe(300);
  });

  it("is turned away for another guest's session, an ended session, something that isn't a JPEG, or when AI is used up", async () => {
    const deps = { db, guard: guard(), reader };
    expect(await readFrame(deps, b.id, session, await frame())).toEqual({ ok: false, reason: "session" });
    expect(await readFrame(deps, a.id, session, Buffer.from("not a frame"))).toEqual({ ok: false, reason: "frame" });
    expect(await readFrame({ ...deps, guard: guard(0) }, a.id, session, await frame())).toEqual({ ok: false, reason: "allowance" });
    await db.from("sessions").update({ status: "ended" }).eq("id", session).throwOnError();
    expect(await readFrame(deps, a.id, session, await frame())).toEqual({ ok: false, reason: "session" });
    expect(seenFrames).toEqual([]);
  });

  it("two frames in 3 seconds at most (tech spec 6; review batch 5, D11)", async () => {
    await db.from("rate_limits").delete().eq("user_id", a.id).throwOnError();
    // The limit counts in fixed 3-second windows, so quick tries can fall either side of a window's edge;
    // of five, at least three share a window, and the third of those is turned away. A page sending one
    // frame every 2.1 seconds never has three in one window, which 1 in 2 seconds couldn't promise.
    const tries: boolean[] = [];
    for (let i = 0; i < 5; i++) tries.push(await withinLimit(a.db, "cameraFrame"));
    expect(tries[0]).toBe(true);
    expect(tries[1]).toBe(true);
    expect(tries.filter((ok) => !ok).length).toBeGreaterThanOrEqual(1);
  });
});
