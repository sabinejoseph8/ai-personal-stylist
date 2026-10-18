import type { Metadata } from "next";
import VideoTest from "./VideoTest";

export const metadata: Metadata = { title: "Video stylist test", robots: { index: false } };

export default function Page() {
  return <VideoTest />;
}
