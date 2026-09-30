'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CatalogGrid } from '@/components/CatalogClient';
import { LocationPicker, useShop } from '@/components/CommerceClient';
import JsonLd from '@/components/JsonLd';
import { type Product } from '@/lib/catalog';
import { fetchPasalhoProductPage } from '@/lib/pasalhoCommerce';
import { absoluteUrl, breadcrumbSchema } from '@/lib/seo';

export default function Shop() {
  const { categories, products, loading, delivery } = useShop();
  const [liveProducts, setLiveProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!delivery) {
        if (active) {
          setLiveProducts([]);
          setTotal(0);
          setPage(1);
          setPageError('');
        }
        return;
      }

      if (active) {
        setPageLoading(true);
        setPageError('');
      }
      fetchPasalhoProductPage(delivery.locationId, { page: 1, limit: 60 })
        .then((result) => {
          if (!active) return;
          setLiveProducts(result.items);
          setTotal(result.total);
          setPage(1);
        })
        .catch((error) => {
          if (!active) return;
          setLiveProducts(products);
          setTotal(products.length);
          setPageError(
            error instanceof Error ? error.message : 'Could not load the live catalogue.',
          );
        })
        .finally(() => {
          if (active) setPageLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [delivery, products]);

  async function loadMore() {
    if (!delivery || pageLoading || liveProducts.length >= total) return;
    setPageLoading(true);
    setPageError('');
    try {
      const next = await fetchPasalhoProductPage(delivery.locationId, {
        page: page + 1,
        limit: 60,
      });
      setLiveProducts((current) => {
        const ids = new Set(current.map((product) => product.id));
        return [...current, ...next.items.filter((product) => !ids.has(product.id))];
      });
      setTotal(next.total);
      setPage(next.page);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : 'Could not load more products.',
      );
    } finally {
      setPageLoading(false);
    }
  }

  const shownProducts = delivery ? liveProducts : products;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Shop Pasalho products',
    url: absoluteUrl('/shop'),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: shownProducts.length,
      itemListElement: shownProducts.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: product.name,
        url: absoluteUrl(`/product/${product.slug}`),
      })),
    },
  };

  return (
    <div className="shell page quick-shop-page">
      <JsonLd
        data={[
          schema,
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Shop', path: '/shop' },
          ]),
        ]}
      />
      <div className="quick-shop-head">
        <div>
          <p className="eyebrow">PASALHO CATALOGUE</p>
          <h1>What do you need today?</h1>
          <p>
            {delivery
              ? `Showing ${shownProducts.length} of ${total || shownProducts.length} live products from ${delivery.storeName}.`
              : 'Set your location to load live store stock and pricing.'}
          </p>
        </div>
        <LocationPicker />
      </div>

      <div className="chips quick-chips">
        {categories.map((category) => (
          <Link href={`/category/${category.slug}`} key={category.id}>
            {category.name}
          </Link>
        ))}
      </div>

      {pageError ? <p className="commerce-message error">{pageError}</p> : null}

      {(loading || pageLoading) && !shownProducts.length ? (
        <p className="catalog-loading">Loading store catalogue…</p>
      ) : (
        <>
          <CatalogGrid initial={shownProducts} />
          {delivery && shownProducts.length < total ? (
            <div className="catalog-load-more">
              <button className="secondary-btn" onClick={loadMore} disabled={pageLoading}>
                {pageLoading ? 'Loading…' : 'Load more products'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
