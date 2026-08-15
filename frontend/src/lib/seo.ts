interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  noIndex?: boolean;
}

export function generateMetadata({
  title,
  description,
  canonical,
  ogImage,
  noIndex = false,
}: SEOProps) {
  const baseUrl = 'https://storesync.com';
  const defaultTitle = 'StoreSync - Modern Trade Platform';
  const defaultDescription = 'Your trusted local mini-mart with quality products and great service across Nepal';
  
  return {
    title: title ? `${title} | StoreSync` : defaultTitle,
    description: description || defaultDescription,
    canonical: canonical ? `${baseUrl}${canonical}` : baseUrl,
    openGraph: {
      title: title || defaultTitle,
      description: description || defaultDescription,
      url: canonical ? `${baseUrl}${canonical}` : baseUrl,
      siteName: 'StoreSync',
      locale: 'en_IN',
      type: 'website',
      images: ogImage ? [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title || defaultTitle,
        },
      ] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: title || defaultTitle,
      description: description || defaultDescription,
      images: ogImage ? [ogImage] : [],
    },
    robots: {
      index: !noIndex,
      follow: !noIndex,
    },
  };
}
