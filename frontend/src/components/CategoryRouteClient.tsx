'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CatalogGrid } from '@/components/CatalogClient';
import { LocationPicker, useShop } from '@/components/CommerceClient';
import { mapPasalhoProduct, type Product } from '@/lib/catalog';
import { commerceRequest } from '@/lib/pasalhoCommerce';

type ProductPage = {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
};

export default function CategoryRouteClient({ slug }: { slug: string }) {
  const { categories, delivery } = useShop();
  const category = categories.find((item) => item.slug === slug);

  const [liveProducts, setLiveProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!delivery || !category || category.id.startsWith('opening-')) {
      setLiveProducts([]);
      return;
    }

    let active = true;
    setLoading(true);
    setError('');

    const load = async () => {
      const rows: Record<string, unknown>[] = [];
      let page = 1;
      let total = 0;

      do {
        const result = await commerceRequest<ProductPage>(
          `products?locationId=${encodeURIComponent(delivery.locationId)}&categoryId=${encodeURIComponent(category.id)}&page=${page}&limit=60`,
        );
        rows.push(...result.items);
        total = result.total;
        page += 1;
      } while (rows.length < total && page <= 10);

      if (active) {
        setLiveProducts(
          rows
            .map(mapPasalhoProduct)
            .filter((product) => product.price > 0),
        );
      }
    };

    load()
      .catch((reason) => {
        if (!active) return;
        setLiveProducts([]);
        setError(
          reason instanceof Error
            ? reason.message
            : 'Could not load this Pasalho category.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [category, delivery]);

  if (!delivery) {
    return (
      <div className="shell page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span>›</span><Link href="/shop">Shop</Link><span>›</span>
          <span>{category?.name || 'Category'}</span>
        </nav>
        <div className="location-required">
          <p className="eyebrow">LIVE PASALHO CATALOGUE</p>
          <h1>{category?.name || 'Choose your category'}</h1>
          <p>Set your delivery location to see products, prices and stock from the Pasalho store that can actually serve you.</p>
          <LocationPicker prominent />
        </div>
      </div>
    );
  }

  if (loading || (category?.id.startsWith('opening-') ?? false)) {
    return <div className="shell page"><p>Loading live category stock…</p></div>;
  }

  if (!category) {
    return (
      <div className="shell page empty-page">
        <h1>Category unavailable</h1>
        <p>This category is not currently available at {delivery.storeName}.</p>
        <Link className="primary-btn" href="/shop">Browse live catalogue</Link>
      </div>
    );
  }

  return (
    <div className="shell page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link><span>›</span><Link href="/shop">Shop</Link><span>›</span>
        <span aria-current="page">{category.name}</span>
      </nav>

      <div className="quick-shop-head">
        <div>
          <p className="eyebrow">LIVE AT {delivery.storeName.toUpperCase()}</p>
          <h1>{category.name}</h1>
          <p>
            {error
              ? error
              : `${liveProducts.length} currently orderable product${liveProducts.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <LocationPicker />
      </div>

      {liveProducts.length ? (
        <CatalogGrid initial={liveProducts} />
      ) : (
        <div className="empty-page">
          <h2>No sellable products right now</h2>
          <p>{error || 'Pasalho will show items here when this store has orderable stock.'}</p>
          <Link className="primary-btn" href="/shop">Browse other categories</Link>
        </div>
      )}
    </div>
  );
}
