import type { Metadata } from "next";
import CameraTest from "./CameraTest";

export const metadata: Metadata = { title: "Camera test", robots: { index: false } };

export default function Page() {
  return <CameraTest />;
}
