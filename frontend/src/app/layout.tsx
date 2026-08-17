import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipLink from "@/components/SkipLink";
import { CommerceProvider, MobileNav } from "@/components/CommerceClient";

export const metadata: Metadata = {
  title: { default: "StoreSync — Everyday value for every home", template: "%s | StoreSync" },
  description: "Shop groceries, fresh food, home essentials and more at dependable everyday prices.",
  metadataBase: new URL("https://storesync.com"),
  alternates: { canonical: "/" },
  openGraph: { siteName: "StoreSync", locale: "en_NP", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen flex flex-col">
        <CommerceProvider><SkipLink/><Header/><main id="main-content" className="flex-1">{children}</main><Footer/><MobileNav/></CommerceProvider>
      </body>
    </html>
  );
}
