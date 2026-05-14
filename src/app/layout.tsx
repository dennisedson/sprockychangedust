import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sprocky Changedust",
  description:
    "AI-assisted HubSpot Developer Changelog monitoring for GitHub repositories.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
