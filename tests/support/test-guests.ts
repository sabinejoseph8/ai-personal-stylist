import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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

/** Creates a guest and signs in as them, without the bot check. Call remove() when done. */
export async function createTestGuest(): Promise<TestGuest> {
  const server = serverDb();
  const email = `test-guest-${randomUUID()}@example.com`;
  const created = await server.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`creating a test guest failed: ${created.error?.message}`);
  const link = await server.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`signing in a test guest failed: ${link.error.message}`);
  const db = visitorDb();
  const session = await db.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (session.error) throw new Error(`signing in a test guest failed: ${session.error.message}`);
  const id = created.data.user.id;
  return {
    db,
    id,
    remove: async () => {
      await db.auth.signOut();
      const files = (await server.storage.from("guest-photos").list(id)).data ?? [];
      if (files.length) await server.storage.from("guest-photos").remove(files.map((f) => `${id}/${f.name}`));
      // Usage records outlive deleted guests (they count toward the month), so tests remove their own.
      await server.from("usage").delete().eq("user_id", id);
      await server.auth.admin.deleteUser(id);
    },
  };
}
