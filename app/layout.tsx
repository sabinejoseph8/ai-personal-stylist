import type { Metadata } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import "./globals.css";

// Fonts are served from our own site (tech spec section 2). The files come with the Fontsource
// packages (open font licence), because fetching them from Google at build time sometimes failed (2e).
const newsreader = localFont({
  src: [
    { path: "../node_modules/@fontsource/newsreader/files/newsreader-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/newsreader/files/newsreader-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../node_modules/@fontsource/newsreader/files/newsreader-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../node_modules/@fontsource/newsreader/files/newsreader-latin-500-italic.woff2", weight: "500", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});
const figtree = localFont({
  src: [
    { path: "../node_modules/@fontsource/figtree/files/figtree-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/figtree/files/figtree-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-figtree",
  display: "swap",
});

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
