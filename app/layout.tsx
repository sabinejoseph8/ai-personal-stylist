import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Personal Stylist",
  description: "Talk face to face with an AI stylist. Sample products only.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
