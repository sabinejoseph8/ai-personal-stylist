import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { attachVoiceCall, type VoiceCallDeps, VoiceOffer } from "@/lib/voice-calls";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 6c: the browser's offer becomes the session's voice call, only for the guest's open session's pending
// call; a call made after the session moved on is closed at once. OpenAI is replaced by a stand-in.

describe("the browser's offer", () => {
  it("is kept exactly as sent, with its final line break (OpenAI refused trimmed offers, 27 Oct 2026)", () => {
    const sdp = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n";
    expect(VoiceOffer.parse({ callId: "voice:pending:x", sdp }).sdp).toBe(sdp);
  });
});

describe.skipIf(!canRunDatabaseTests)("joining a voice call", () => {
  const db = serverDb();
  let guest: TestGuest;
  let session: string;
  const pending = "voice:pending:11111111-1111-4111-8111-111111111111";
  const made: (string | null)[] = [];
  const closed: string[] = [];
  const deps = (ok = true): VoiceCallDeps => ({
    db,
    create: async (_offer, context) => {
      made.push(context);
      return ok ? { ok: true, sessionId: `live_${made.length}`, sdp: "answer-sdp" } : { ok: false, status: 503 };
    },
    close: async (id) => void closed.push(id),
  });

  beforeAll(async () => {
    guest = await createTestGuest();
  }, 30_000);
  beforeEach(async () => {
    made.length = 0;
    closed.length = 0;
    await db.from("sessions").delete().eq("user_id", guest.id).throwOnError();
    session = (await db.from("sessions").insert({ user_id: guest.id, status: "active", engine: "voice", call_id: pending }).select("id").single().throwOnError()).data!.id;
    await db.from("session_notes").insert({ user_id: guest.id, session_id: session, kind: "occasion", note_text: "Outdoor wedding, November", status: "confirmed", hidden_details: [], source: "voice" }).throwOnError();
  });
  afterAll(async () => guest?.remove());

  it("makes the call with the notes so far, and records OpenAI's id on the session", async () => {
    expect(await attachVoiceCall(deps(), guest.id, session, pending, "offer-sdp")).toEqual({ ok: true, callId: "voice:live_1", sdp: "answer-sdp" });
    expect(made[0]).toContain("Outdoor wedding, November");
    const { data: s } = await db.from("sessions").select("call_id, call_started_at").eq("id", session).single().throwOnError();
    expect(s?.call_id).toBe("voice:live_1");
    // The call's time counts from here, when OpenAI started it (6d review).
    expect(Date.now() - Date.parse(s!.call_started_at)).toBeLessThan(10_000);
    // The same pending call can't be joined twice.
    expect(await attachVoiceCall(deps(), guest.id, session, pending, "offer-sdp")).toEqual({ ok: false, reason: "no_call" });
    expect(made).toHaveLength(1);
  });

  it("refuses another guest, a call that isn't pending, and says when OpenAI refuses", async () => {
    const other = await createTestGuest();
    try {
      expect(await attachVoiceCall(deps(), other.id, session, pending, "offer-sdp")).toEqual({ ok: false, reason: "no_call" });
    } finally {
      await other.remove();
    }
    expect(await attachVoiceCall(deps(), guest.id, session, "voice:live_9", "offer-sdp")).toEqual({ ok: false, reason: "no_call" });
    expect(await attachVoiceCall(deps(false), guest.id, session, pending, "offer-sdp")).toEqual({ ok: false, reason: "unavailable", status: 503 });
    expect((await db.from("sessions").select("call_id").eq("id", session).single()).data?.call_id).toBe(pending);
  });

  it("closes a call made after the session moved on", async () => {
    const racing: VoiceCallDeps = {
      ...deps(),
      create: async () => {
        await db.from("sessions").update({ status: "ended" }).eq("id", session).throwOnError();
        return { ok: true, sessionId: "live_late", sdp: "answer-sdp" };
      },
    };
    expect(await attachVoiceCall(racing, guest.id, session, pending, "offer-sdp")).toEqual({ ok: false, reason: "no_call" });
    expect(closed).toEqual(["voice:live_late"]);
  });
});
