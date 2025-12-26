import type { Metadata } from "next";
import "./globals.css";
import CookieConsentBanner from "@/components/CookieConsent";

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
      <body>
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
