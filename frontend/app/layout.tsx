import type { Metadata } from "next";
import "./globals.css";
import CookieConsentBanner from "@/components/CookieConsent";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "DSA (Distance-based Structural Analysis)",
  description: "Distance-based Structural Analysis",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="flex flex-col min-h-screen">
        <main className="flex-1">
          {children}
        </main>
        <Footer />
        <CookieConsentBanner />
      </body>
    </html>
  );
}
