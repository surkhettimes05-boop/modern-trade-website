import type { Metadata } from 'next';
import ProductRouteClient from '@/components/ProductRouteClient';
import { buildMetadata } from '@/lib/seo';

type Props = { params: Promise<{ slug: string }> };

function labelFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const label = labelFromSlug(slug);
  return buildMetadata({
    title: label || 'Product',
    description: `Check live Pasalho pricing and store availability for ${label || 'this product'}.`,
    path: `/product/${slug}`,
  });
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  return <ProductRouteClient slug={slug} />;
}
