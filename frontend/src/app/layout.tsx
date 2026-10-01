import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { CommerceProvider } from "@/components/CommerceClient";
import JsonLd from "@/components/JsonLd";
import { getCatalog } from "@/lib/serverCatalog";
import { absoluteUrl, SITE } from "@/lib/seo";
import WebVitals from "@/components/WebVitals";
import RouteChrome from "@/components/RouteChrome";

// The customer catalog is supplied by the Commerce backend at runtime. Do not
// freeze an empty catalog into the production image during `next build`.
export const dynamic = "force-dynamic";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Pasalho — Your Money Deserves Proper Value.",
    template: "%s | Pasalho",
  },
  description: SITE.description,
  metadataBase: new URL(SITE.url),
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: "Pasalho — Your Money Deserves Proper Value.",
    description: SITE.description,
    url: absoluteUrl("/"),
    siteName: SITE.name,
    locale: SITE.locale,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pasalho — Your Money Deserves Proper Value.",
    description: SITE.description,
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { products, categories } = await getCatalog();
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE.url}/#organization`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    publisher: { "@id": `${SITE.url}/#organization` },
    inLanguage: SITE.language,
  };
  return (
    <html lang="en-NP" className="antialiased">
      <body className={`${montserrat.variable} min-h-screen flex flex-col`}>
        <JsonLd data={[organization, website]} />
        <WebVitals />
        <CommerceProvider
          initialProducts={products}
          initialCategories={categories}
          initialCatalogLoaded
        >
          <RouteChrome>{children}</RouteChrome>
        </CommerceProvider>
      </body>
    </html>
  );
}
