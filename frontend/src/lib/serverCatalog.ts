import 'server-only';

import { cache } from 'react';
import { mapCategory, mapProduct, type Offer, type Product, type Store, type StorefrontCategory } from '@/lib/catalog';
import { configuredServerApiUrl } from '@/lib/serverApiUrl';

type CatalogData = { products: Product[]; categories: StorefrontCategory[]; stores: Store[]; offers: Offer[] };

function apiBaseUrl() {
  try {
    const url = configuredServerApiUrl();
    if (!url) return null;
    return url.hostname === 'api.example.com' ? null : url;
  } catch {
    return null;
  }
}

async function fetchPublic<T>(path: string): Promise<T[]> {
  const base = apiBaseUrl();
  if (!base) return [];
  try {
    const response = await fetch(new URL(`/api/public/${path}`, base), {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return [];
    const value: unknown = await response.json();
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

export const getCatalog = cache(async (): Promise<CatalogData> => {
  const [productRows, categoryRows, stores, offers] = await Promise.all([
    fetchPublic<Record<string, unknown>>('products?limit=2500'),
    fetchPublic<Record<string, unknown>>('categories'),
    fetchPublic<Store>('stores'),
    fetchPublic<Offer>('offers'),
  ]);
  const products = productRows.map(mapProduct).filter((product) => product.price > 0);
  const categories = categoryRows.map(mapCategory);
  return { products, categories, stores, offers };
});

export const getProductBySlug = cache(async (slug: string) => {
  const { products } = await getCatalog();
  return products.find((product) => product.slug === slug) || null;
});

export const getCategoryBySlug = cache(async (slug: string) => {
  const { categories } = await getCatalog();
  return categories.find((category) => category.slug === slug) || null;
});
