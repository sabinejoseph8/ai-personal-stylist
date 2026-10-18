import type { Metadata } from "next";
import VoiceTest from "./VoiceTest";

export const metadata: Metadata = { title: "Voice only test", robots: { index: false } };

export default function Page() {
  return <VoiceTest />;
}
