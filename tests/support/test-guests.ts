import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Test guests for database tests. Bot protection blocks normal sign-in in tests, so the
// server key creates them directly (Sabine's decision, 1b). The key never reaches the app.
export function setting(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env.local")) return undefined;
  const line = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() || undefined;
}

export const SUPABASE_URL = setting("NEXT_PUBLIC_SUPABASE_URL") ?? "https://bdbfmhamhhxcxxmfgqok.supabase.co";
export const PUBLISHABLE_KEY =
  setting("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? "sb_publishable_rHQjuL4nBhgwysm019dGDg_39X2DH8b";
const secret = setting("SUPABASE_SECRET_KEY");

export const canRunDatabaseTests = Boolean(secret);

export type TestGuest = { db: SupabaseClient; id: string; remove: () => Promise<void> };

/** Supabase with the server key, to set up test guests and check what the database really holds. */
export function serverDb() {
  return createClient(SUPABASE_URL, secret!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A visitor who isn't signed in. */
export function visitorDb() {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Signs in a brand-new test guest, without the bot check. */
async function newGuest() {
  const server = serverDb();
  const email = `test-guest-${randomUUID()}@example.com`;
  const created = await server.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`creating a test guest failed: ${created.error?.message}`);
  const link = await server.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`signing in a test guest failed: ${link.error.message}`);
  const db = visitorDb();
  const session = await db.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (session.error) throw new Error(`signing in a test guest failed: ${session.error.message}`);
  return { db, id: created.data.user.id };
}

/** Deletes a test guest and everything they left (usage records outlive deleted guests, so tests remove their own). */
async function deleteGuest(db: SupabaseClient, id: string) {
  const server = serverDb();
  await db.auth.signOut();
  const files = (await server.storage.from("guest-photos").list(id)).data ?? [];
  if (files.length) await server.storage.from("guest-photos").remove(files.map((f) => `${id}/${f.name}`));
  await server.from("usage").delete().eq("user_id", id);
  await server.auth.admin.deleteUser(id);
}

/** Puts a guest back to how a new guest starts: no sessions, usage, counts or saved things, and a fresh profile. */
async function resetGuest(id: string) {
  const server = serverDb();
  const files = (await server.storage.from("guest-photos").list(id)).data ?? [];
  if (files.length) await server.storage.from("guest-photos").remove(files.map((f) => `${id}/${f.name}`));
  // A session's notes, feedback, photos, looks and checks go with it.
  for (const table of ["sessions", "saved_looks", "bag_items", "wardrobe_items", "saved_preferences", "usage", "rate_limits", "consents", "profiles"]) {
    await server.from(table).delete().eq("user_id", id).throwOnError();
  }
  await server.from("profiles").insert({ user_id: id }).throwOnError();
  await server.from("consents").insert({ user_id: id }).throwOnError();
}

// The pool (Phase 2 review). Supabase allows about 30 sign-ins every 5 minutes, and every test file
// used to sign in new guests, so test runs kept hitting the limit. Now a small pool of guests is
// reused: each slot is held by one test process at a time (a lock file), and its sign-in is saved
// in node_modules/.cache (never committed) and renewed rather than repeated. The daily job deletes
// test guests after a day, so a slot's guest is replaced after 20 hours.
const POOL = join(process.cwd(), "node_modules", ".cache", "test-guests");
const SLOTS = 12;
const STALE_LOCK_MS = 15 * 60_000;
const REPLACE_AFTER_MS = 20 * 3600_000;
type Saved = { id: string; refreshToken: string; createdAt: number };

function takeSlot(): number | null {
  mkdirSync(POOL, { recursive: true });
  for (let i = 0; i < SLOTS; i++) {
    const lock = join(POOL, `${i}.lock`);
    if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) unlinkSync(lock); // left by a crashed run
    try {
      closeSync(openSync(lock, "wx"));
      return i;
    } catch {
      // held by another test process
    }
  }
  return null;
}

/** A test guest, signed in, from the pool when a slot is free. Call remove() when done. */
export async function createTestGuest(options: { fresh?: boolean } = {}): Promise<TestGuest> {
  const slot = options.fresh ? null : takeSlot();
  if (slot === null) {
    const guest = await newGuest();
    return { ...guest, remove: () => deleteGuest(guest.db, guest.id) };
  }
  const file = join(POOL, `${slot}.json`);
  const release = () => unlinkSync(join(POOL, `${slot}.lock`));
  try {
    const saved: Saved | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    let guest: { db: SupabaseClient; id: string } | null = null;
    let createdAt = saved?.createdAt ?? Date.now();
    if (saved && Date.now() - saved.createdAt < REPLACE_AFTER_MS) {
      const db = visitorDb();
      const renewed = await db.auth.refreshSession({ refresh_token: saved.refreshToken });
      if (!renewed.error && renewed.data.user?.id === saved.id) guest = { db, id: saved.id };
    }
    if (!guest) {
      if (saved) await serverDb().auth.admin.deleteUser(saved.id).catch(() => undefined);
      guest = await newGuest();
      createdAt = Date.now();
    }
    const { db, id } = guest;
    const save = async () => {
      const token = (await db.auth.getSession()).data.session?.refresh_token;
      if (token) writeFileSync(file, JSON.stringify({ id, refreshToken: token, createdAt } satisfies Saved));
    };
    await save();
    await resetGuest(id);
    return {
      db,
      id,
      remove: async () => {
        try {
          await resetGuest(id);
          await save();
        } finally {
          release();
        }
      },
    };
  } catch (e) {
    release();
    throw e;
  }
}
