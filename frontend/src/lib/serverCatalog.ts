import 'server-only';

import { cache } from 'react';
import {
  mapPasalhoCategory,
  mapPasalhoProduct,
  mapProduct,
  openingCategories,
  openingProducts,
  type Offer,
  type Product,
  type Store,
  type StorefrontCategory,
} from '@/lib/catalog';
import {
  configuredPasalhoApiUrl,
  configuredServerApiUrl,
} from '@/lib/serverApiUrl';

type CatalogData = {
  products: Product[];
  categories: StorefrontCategory[];
  stores: Store[];
  offers: Offer[];
};

type ApiEnvelope<T> = { success?: boolean; data?: T };

function apiBaseUrl() {
  try {
    const url = configuredServerApiUrl();
    if (!url) return null;
    return url.hostname === 'api.example.com' ? null : url;
  } catch {
    return null;
  }
}

async function fetchLegacyPublic<T>(path: string): Promise<T[]> {
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
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

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

async function getLegacyCatalog(): Promise<CatalogData> {
  const [productRows, categoryRows, stores, offers] = await Promise.all([
    fetchLegacyPublic<Record<string, unknown>>('products'),
    fetchLegacyPublic<StorefrontCategory>('categories'),
    fetchLegacyPublic<Store>('stores'),
    fetchLegacyPublic<Offer>('offers'),
  ]);

  const apiProducts = productRows
    .map(mapProduct)
    .filter((product) => product.price > 0);
  const categoriesBySlug = new Map(
    categoryRows.map((category) => [category.slug, category]),
  );
  const categories = openingCategories
    .map((opening) => ({
      ...opening,
      ...categoriesBySlug.get(opening.slug),
      id: opening.id,
    }))
    .concat(
      categoryRows.filter(
        (category) =>
          !openingCategories.some((opening) => opening.slug === category.slug),
      ),
    );

  return {
    products: apiProducts.length ? apiProducts : openingProducts,
    categories,
    stores,
    offers,
  };
}

export const getCatalog = cache(async (): Promise<CatalogData> => {
  const pasalho = await getPasalhoDefaultCatalog();
  if (pasalho) return pasalho;

  // Customer commerce must not advertise fake stock before Pasalho resolves a store.
  // Legacy catalog remains available to legacy staff routes, but the customer surface
  // starts empty until a Pasalho fulfillment location is known.
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
