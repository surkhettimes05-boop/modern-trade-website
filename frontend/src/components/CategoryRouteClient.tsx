'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CatalogGrid } from '@/components/CatalogClient';
import { LocationPicker, useShop } from '@/components/CommerceClient';
import { fetchPasalhoProductPage, type PasalhoProductPage } from '@/lib/pasalhoCommerce';

export default function CategoryRouteClient({ slug }: { slug: string }) {
  const { categories, products, loading, delivery } = useShop();
  const category = categories.find((item) => item.slug === slug);
  const fallbackList = useMemo(
    () =>
      category
        ? products.filter(
            (product) =>
              product.categoryId === category.id ||
              product.category.toLowerCase() === category.name.toLowerCase(),
          )
        : [],
    [category, products],
  );

  const [pageData, setPageData] = useState<PasalhoProductPage | null>(null);
  const [extraItems, setExtraItems] = useState<PasalhoProductPage['items']>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    if (!delivery || !category) {
      setPageData(null);
      setExtraItems([]);
      setPageError('');
      return;
    }

    let active = true;
    setPageLoading(true);
    setPageError('');
    fetchPasalhoProductPage(delivery.locationId, {
      categoryId: category.id,
      page: 1,
      limit: 60,
    })
      .then((page) => {
        if (!active) return;
        setPageData(page);
        setExtraItems([]);
      })
      .catch((error) => {
        if (!active) return;
        setPageError(
          error instanceof Error ? error.message : 'Could not load this category.',
        );
      })
      .finally(() => {
        if (active) setPageLoading(false);
      });

    return () => {
      active = false;
    };
  }, [category, delivery]);

  const list = pageData ? [...pageData.items, ...extraItems] : fallbackList;
  const total = pageData?.total ?? fallbackList.length;
  const loadedPages = pageData
    ? 1 + Math.ceil(extraItems.length / pageData.limit)
    : 1;

  async function loadMore() {
    if (!delivery || !category || !pageData || pageLoading) return;
    setPageLoading(true);
    setPageError('');
    try {
      const next = await fetchPasalhoProductPage(delivery.locationId, {
        categoryId: category.id,
        page: loadedPages + 1,
        limit: pageData.limit,
      });
      setExtraItems((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...next.items.filter((item) => !ids.has(item.id))];
      });
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : 'Could not load more products.',
      );
    } finally {
      setPageLoading(false);
    }
  }

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

  if ((loading || pageLoading) && !pageData && !fallbackList.length) {
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
            Showing {list.length} of {total} currently orderable product{total === 1 ? '' : 's'}.
          </p>
        </div>
        <LocationPicker />
      </div>

      {pageError ? <p className="commerce-message error">{pageError}</p> : null}

      {list.length ? (
        <>
          <CatalogGrid initial={list} />
          {list.length < total ? (
            <div className="catalog-load-more">
              <button className="secondary-btn" onClick={loadMore} disabled={pageLoading}>
                {pageLoading ? 'Loading…' : 'Load more products'}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-page">
          <h2>No sellable products right now</h2>
          <p>Pasalho will show items here when this store has orderable stock.</p>
          <Link className="primary-btn" href="/shop">Browse other categories</Link>
        </div>
      )}
    </div>
  );
}
