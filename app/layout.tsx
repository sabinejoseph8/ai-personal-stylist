import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Personal Stylist",
  description: "Talk face to face with an AI stylist. Sample products only.",
};

// Every page renders per request, so each gets a fresh security nonce (see proxy.ts).
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
