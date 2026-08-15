import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipLink from "@/components/SkipLink";
import { CommerceProvider, MobileNav } from "@/components/CommerceClient";

const inter = Manrope({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {title:{default:"NOVA MART — Everyday value for every home",template:"%s | NOVA MART"},description:"Shop groceries, fresh food, home essentials, electronics and more at dependable everyday prices.",metadataBase:new URL("https://novamart.example")};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-screen flex flex-col">
        <CommerceProvider><SkipLink/><Header/><main id="main-content" className="flex-1">{children}</main><Footer/><MobileNav/></CommerceProvider>
      </body>
    </html>
  );
}
