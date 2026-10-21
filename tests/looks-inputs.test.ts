import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import { filterCandidates } from "@/core/looks/candidates";
import { lookRequirements } from "@/lib/looks-inputs";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { saveBudget, savePreferences, saveShopping } from "@/lib/profile-store";
import { catalogProducts } from "./support/catalog-products";
import { canRunDatabaseTests, createTestGuest, serverDb, type TestGuest } from "./support/test-guests";

// 4a: what a session's looks must meet, from the profile and the session's confirmed notes, and the
// candidate filter run on the real sample catalog in the database (tech spec 1.3 steps 1 and 2).

describe.skipIf(!canRunDatabaseTests)("a session's look requirements", () => {
  const db = serverDb();
  let guest: TestGuest;
  let session: string;
  const note = (kind: string, text: string, status: string, details: { name: string; value: string }[]) => ({
    user_id: guest.id,
    session_id: session,
    kind,
    note_text: text,
    status,
    hidden_details: details,
    source: "voice",
  });

  beforeAll(async () => {
    guest = await createTestGuest();
    const { budget, preferences, ...shopping } = SAMPLE_PROFILE;
    await saveShopping(guest.db, guest.id, shopping);
    await saveBudget(guest.db, guest.id, budget);
    await savePreferences(guest.db, [...preferences, { kind: "never", words: "anything too flashy" }]);
    session = (await db.from("sessions").insert({ user_id: guest.id, status: "active" }).select("id").single().throwOnError()).data!.id;
    await db
      .from("session_notes")
      .insert([
        note("budget", "Budget: up to $350", "confirmed", [{ name: "max", value: "350" }]),
        note("outfit", "Dress", "confirmed", [{ name: "outfit", value: "dress" }]),
        note("colors", "Not black", "confirmed", [{ name: "avoid", value: "black" }]),
        note("colors", "Not red", "to_confirm", [{ name: "avoid", value: "red" }]),
      ])
      .throwOnError();
  }, 30_000);
  afterAll(async () => guest?.remove());

  it("come from the profile and the confirmed notes; a preference without a rule yet is judged", async () => {
    const req = await lookRequirements(db, guest.id, session);
    expect(req.departments).toEqual(["womenswear"]);
    expect(req.sizes).toEqual(SAMPLE_PROFILE.sizes);
    expect(req.budget).toEqual({ meaning: "up_to", amount: 350, from: "notes" });
    expect(req.categories).toContain("dress");
    expect(req.categories).not.toContain("trousers");
    expect(req.rules.map((r) => [r.words, r.rule.type, r.from])).toEqual([
      ["high heels", "detail", "profile"],
      ["sleeves", "detail", "profile"],
      ["anything too flashy", "judged", "profile"],
      ["Not black", "detail", "notes"],
    ]);
  });

  it("narrow the real catalog to products that could appear, with every one left out explained", async () => {
    const req = await lookRequirements(db, guest.id, session);
    const { kept, leftOut } = filterCandidates(await createSampleCatalog(db).search({ department: "womenswear", limit: 1000 }), req);
    expect(kept.length).toBeGreaterThan(5);
    for (const p of kept) {
      expect(p.department).toBe("womenswear");
      expect(p.price.amountCents).toBeLessThanOrEqual(35000);
      expect(p.colors.some((c) => c.includes("black"))).toBe(false);
      if (p.category === "shoes") expect(p.details.heelCm).toBeLessThanOrEqual(5);
      expect(p.details.sleeve).not.toBe("sleeveless");
    }
    expect(kept.some((p) => p.category === "dress")).toBe(true);
    expect(leftOut.length + kept.length).toBe(76);
    expect(leftOut.every((l) => l.reason.length > 0)).toBe(true);
  });

  it("judge a saved rule that isn't the right shape, rather than failing every look (Phase 4 code review)", async () => {
    // A guest can write their own preference rows, so a rule may not be one setup made.
    await db.from("saved_preferences").update({ rule: { type: "detail" } }).eq("user_id", guest.id).eq("words", "high heels").throwOnError();
    const req = await lookRequirements(db, guest.id, session);
    expect(req.rules.find((r) => r.words === "high heels")?.rule).toEqual({ type: "judged" });
    expect(() => filterCandidates(catalogProducts, req)).not.toThrow();
  });
});
