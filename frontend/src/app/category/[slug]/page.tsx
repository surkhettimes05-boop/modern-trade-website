import type { Metadata } from 'next';
import CategoryRouteClient from '@/components/CategoryRouteClient';
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
    title: `${label} products`,
    description: `Shop ${label.toLowerCase()} from Pasalho with store-scoped stock and NPR pricing.`,
    path: `/category/${slug}`,
  });
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  return <CategoryRouteClient slug={slug} />;
}
