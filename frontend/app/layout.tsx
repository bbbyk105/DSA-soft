import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DSA Analysis",
  description: "Distance-based Structural Analysis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
