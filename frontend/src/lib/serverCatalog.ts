import 'server-only';

import { cache } from 'react';
import {
  mapPasalhoCategory,
  mapPasalhoProduct,
  openingCategories,
  type Offer,
  type Product,
  type Store,
  type StorefrontCategory,
} from '@/lib/catalog';
import { configuredPasalhoApiUrl } from '@/lib/serverApiUrl';

type CatalogData = {
  products: Product[];
  categories: StorefrontCategory[];
  stores: Store[];
  offers: Offer[];
};

type ApiEnvelope<T> = { success?: boolean; data?: T };

async function fetchPasalho<T>(path: string): Promise<T | null> {
  let base: URL | null = null;
  try {
    base = configuredPasalhoApiUrl();
  } catch {
    return null;
  }
  if (!base) return null;

  try {
    const response = await fetch(new URL(`/api/v1/commerce/${path}`, base), {
      next: { revalidate: 60 },
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;

    const value = (await response.json()) as ApiEnvelope<T> | T;
    if (
      value &&
      typeof value === 'object' &&
      'success' in value &&
      (value as ApiEnvelope<T>).success === true
    ) {
      return (value as ApiEnvelope<T>).data ?? null;
    }
    return value as T;
  } catch {
    return null;
  }
}

async function getPasalhoDefaultCatalog(): Promise<CatalogData | null> {
  const locationId = process.env.PASALHO_DEFAULT_FULFILLMENT_LOCATION_ID;
  if (!locationId) return null;

  const [categoryRows, productPage] = await Promise.all([
    fetchPasalho<Record<string, unknown>[]>(
      `categories?locationId=${encodeURIComponent(locationId)}`,
    ),
    fetchPasalho<{
      items: Record<string, unknown>[];
      total: number;
      page: number;
      limit: number;
    }>(
      `products?locationId=${encodeURIComponent(locationId)}&page=1&limit=60`,
    ),
  ]);

  if (!categoryRows || !productPage) return null;

  return {
    categories: categoryRows.map(mapPasalhoCategory),
    products: productPage.items.map(mapPasalhoProduct),
    stores: [
      {
        id: locationId,
        name: process.env.PASALHO_DEFAULT_STORE_NAME || 'Pasalho store',
        source: 'pasalho',
      },
    ],
    offers: [],
  };
}

export const getCatalog = cache(async (): Promise<CatalogData> => {
  const pasalho = await getPasalhoDefaultCatalog();
  if (pasalho) return pasalho;

  // Customer commerce deliberately starts without product availability until
  // Pasalho resolves a fulfillment store. Never substitute StoreSync stock.
  return {
    products: [],
    categories: openingCategories,
    stores: [],
    offers: [],
  };
});

export const getProductBySlug = cache(async (slug: string) => {
  const { products } = await getCatalog();
  return products.find((product) => product.slug === slug) || null;
});

export const getCategoryBySlug = cache(async (slug: string) => {
  const { categories } = await getCatalog();
  return categories.find((category) => category.slug === slug) || null;
});
