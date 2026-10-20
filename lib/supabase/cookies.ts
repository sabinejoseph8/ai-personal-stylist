import type { CookieOptionsWithName } from "@supabase/ssr";

// The guest's sign-in lives in a secure cookie that page scripts can't read (tech spec section 6).
// Only our server talks to Supabase as the guest.
export const GUEST_COOKIE: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
