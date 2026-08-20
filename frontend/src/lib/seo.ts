import type { Metadata } from 'next';

export const SITE = {
  name: 'NOVA MART',
  legalName: 'NOVA MART Retail Nepal Pvt. Ltd.',
  description: 'Shop groceries, fresh food and home essentials at dependable everyday prices across Nepal.',
  locale: 'en_NP',
  language: 'en-NP',
  country: 'NP',
  currency: 'NPR',
  url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://storesync.com').replace(/\/$/, ''),
} as const;

export function absoluteUrl(path = '/') {
  return new URL(path, `${SITE.url}/`).toString();
}

type PageMetadata = {
  title: string;
  description: string;
  path: string;
  image?: string;
  noIndex?: boolean;
};

export function buildMetadata({ title, description, path, image, noIndex = false }: PageMetadata): Metadata {
  const canonical = absoluteUrl(path);
  const images = image ? [{ url: absoluteUrl(image), width: 1200, height: 630, alt: title }] : undefined;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: SITE.name, locale: SITE.locale, type: 'website', images },
    twitter: { card: 'summary_large_image', title, description, images: images?.map(({ url }) => url) },
    robots: noIndex ? { index: false, follow: false, nocache: true } : { index: true, follow: true },
  };
}

export function privateMetadata(title: string, path = '/'): Metadata {
  return buildMetadata({ title, description: `${title} for NOVA MART customers and staff.`, path, noIndex: true });
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
