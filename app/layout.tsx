import type { Metadata } from "next";
import { Figtree, Newsreader } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

// Fonts are downloaded at build time and served from our own site (tech spec section 2).
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "AI Personal Stylist",
  description: "Talk face to face with an AI stylist. Sample products only.",
};

// Every page renders per request, so each gets a fresh security nonce (see proxy.ts).
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html lang="en" className={`${newsreader.variable} ${figtree.variable}`}>
      <body>{children}</body>
    </html>
  );
}
