import type { Metadata } from "next";
import DemoTest from "./DemoTest";

export const metadata: Metadata = { title: "Full demo test", robots: { index: false } };

export default function Page() {
  return <DemoTest />;
}
