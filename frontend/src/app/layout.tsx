import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipLink from "@/components/SkipLink";
import { CommerceProvider, MobileNav } from "@/components/CommerceClient";
import JsonLd from "@/components/JsonLd";
import { getCatalog } from "@/lib/serverCatalog";
import { absoluteUrl, SITE } from "@/lib/seo";
import WebVitals from "@/components/WebVitals";

export const metadata: Metadata = {
  title: { default: "NOVA MART — Everyday value for every home", template: "%s | NOVA MART" },
  description: SITE.description,
  metadataBase: new URL(SITE.url),
  alternates: { canonical: absoluteUrl('/') },
  openGraph: { title: 'NOVA MART — Everyday value for every home', description: SITE.description, url: absoluteUrl('/'), siteName: SITE.name, locale: SITE.locale, type: "website" },
  twitter: { card: 'summary_large_image', title: 'NOVA MART — Everyday value for every home', description: SITE.description },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { products, categories, stores } = await getCatalog();
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
  };
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    publisher: { '@id': `${SITE.url}/#organization` },
    inLanguage: SITE.language,
  };
  return (
    <html lang="en-NP" className="antialiased">
      <body className="min-h-screen flex flex-col">
        <JsonLd data={[organization, website]} />
        <WebVitals />
        <CommerceProvider initialProducts={products} initialCategories={categories} initialStores={stores}><SkipLink/><Header/><main id="main-content" className="flex-1">{children}</main><Footer/><MobileNav/></CommerceProvider>
      </body>
    </html>
  );
}
