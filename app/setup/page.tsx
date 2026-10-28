import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppBar } from "@/components/app-bar/app-bar";
import { currentGuest } from "@/lib/guest";
import { loadProfile } from "@/lib/profile-store";
import { SetupFlow } from "./SetupFlow";

export const metadata: Metadata = { title: "Set up your profile · AI Personal Stylist" };

export default async function SetupPage() {
  const guest = await currentGuest();
  if (!guest) redirect("/");
  const profile = await loadProfile(guest.db, guest.id);
  // Next.js keeps a page's state when the shopper navigates away and back (Activity). Keying on the
  // saved profile makes setup start again from what's saved whenever that changes, for example after
  // Use a sample profile, instead of showing old answers and saving them over the new ones.
  return (
    <>
      <AppBar />
      <SetupFlow key={JSON.stringify(profile)} initial={profile} />
    </>
  );
}
