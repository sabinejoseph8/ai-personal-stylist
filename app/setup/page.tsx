import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentGuest } from "@/lib/guest";
import { loadProfile } from "@/lib/profile-store";
import { SetupFlow } from "./SetupFlow";

export const metadata: Metadata = { title: "Set up your profile · AI Personal Stylist" };

export default async function SetupPage() {
  const guest = await currentGuest();
  if (!guest) redirect("/");
  return <SetupFlow initial={await loadProfile(guest.db, guest.id)} />;
}
