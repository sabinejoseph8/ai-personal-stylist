// Public settings the browser may see. None of these are secrets.
// The database is shared by development and the live site until launch (tech spec 1.4).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bdbfmhamhhxcxxmfgqok.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_rHQjuL4nBhgwysm019dGDg_39X2DH8b";
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAAFcgyhpxPNFaqPoa";
