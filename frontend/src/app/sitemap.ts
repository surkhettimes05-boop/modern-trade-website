import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';
import { getCatalog } from '@/lib/serverCatalog';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { categories, products } = await getCatalog();
  const staticPages: Array<{ path: string; changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; priority: number }> = [
    { path: '/', changeFrequency: 'daily', priority: 1 },
    { path: '/shop', changeFrequency: 'daily', priority: 0.9 },
    { path: '/offers', changeFrequency: 'daily', priority: 0.8 },
    { path: '/stores', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/services', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/faq', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/contact', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/guides', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/guides/safer-grocery-storage', changeFrequency: 'yearly', priority: 0.7 },
    { path: '/editorial-policy', changeFrequency: 'yearly', priority: 0.4 },
  ];
  return [
    ...staticPages.map(({ path, ...entry }) => ({ url: absoluteUrl(path), ...entry })),
    ...categories.map((category) => ({ url: absoluteUrl(`/category/${category.slug}`), changeFrequency: 'weekly' as const, priority: 0.8, images: category.image ? [absoluteUrl(category.image)] : undefined })),
    ...products.map((product) => ({ url: absoluteUrl(`/product/${product.slug}`), changeFrequency: 'weekly' as const, priority: 0.7, images: [absoluteUrl(product.image)] })),
  ];
}
