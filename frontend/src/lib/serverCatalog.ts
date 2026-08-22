import 'server-only';

import { cache } from 'react';
import { mapProduct, openingCategories, openingProducts, type Offer, type Product, type Store, type StorefrontCategory } from '@/lib/catalog';

type CatalogData = { products: Product[]; categories: StorefrontCategory[]; stores: Store[]; offers: Offer[] };

function apiBaseUrl() {
  const value = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
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
      next: { revalidate: 300 },
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
    fetchPublic<Record<string, unknown>>('products'),
    fetchPublic<StorefrontCategory>('categories'),
    fetchPublic<Store>('stores'),
    fetchPublic<Offer>('offers'),
  ]);
  const apiProducts = productRows.map(mapProduct).filter((product) => product.price > 0);
  const productsBySku = new Map([...openingProducts, ...apiProducts].map((product) => [product.sku || product.id, product]));
  const categoriesBySlug = new Map(categoryRows.map((category) => [category.slug, category]));
  const categories = openingCategories
    .map((opening) => ({ ...opening, ...categoriesBySlug.get(opening.slug), id: opening.id }))
    .concat(categoryRows.filter((category) => !openingCategories.some((opening) => opening.slug === category.slug)));
  return { products: [...productsBySku.values()], categories, stores, offers };
});

export const getProductBySlug = cache(async (slug: string) => {
  const { products } = await getCatalog();
  return products.find((product) => product.slug === slug) || null;
});

export const getCategoryBySlug = cache(async (slug: string) => {
  const { categories } = await getCatalog();
  return categories.find((category) => category.slug === slug) || null;
});
