import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadProfile, savePreferences } from "@/lib/profile-store";
import { canRunDatabaseTests, createTestGuest, type TestGuest } from "./support/test-guests";

// Saved preferences (R4, R24) are replaced in one step: a failed save keeps the old list (Phase 1 code review).
describe.skipIf(!canRunDatabaseTests)("saved preferences", () => {
  let guest: TestGuest;

  beforeAll(async () => {
    guest = await createTestGuest();
  }, 30_000);
  afterAll(async () => guest?.remove());

  it("saves the list in order and replaces it on the next save", async () => {
    await savePreferences(guest.db, [
      { kind: "never", words: "high heels" },
      { kind: "must_have", words: "sleeves" },
      { kind: "likes", words: "earth tones" },
    ]);
    await savePreferences(guest.db, [
      { kind: "never", words: "high heels" },
      { kind: "likes", words: "emerald" },
    ]);
    const profile = await loadProfile(guest.db, guest.id);
    expect(profile.preferences).toEqual([
      { kind: "never", words: "high heels" },
      { kind: "likes", words: "emerald" },
    ]);
  });

  it("a save that fails keeps the guest's existing preferences", async () => {
    const tooLong = "x".repeat(201); // the database allows up to 200 characters
    await expect(
      savePreferences(guest.db, [
        { kind: "never", words: "sequins" },
        { kind: "likes", words: tooLong },
      ]),
    ).rejects.toThrow();
    const profile = await loadProfile(guest.db, guest.id);
    expect(profile.preferences.map((p) => p.words)).toEqual(["high heels", "emerald"]);
  });

  it("an empty list clears them", async () => {
    await savePreferences(guest.db, []);
    expect((await loadProfile(guest.db, guest.id)).preferences).toEqual([]);
  });
});
