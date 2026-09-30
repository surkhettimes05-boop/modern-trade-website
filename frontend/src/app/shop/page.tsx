'use client';

import Link from 'next/link';
import { CatalogGrid } from '@/components/CatalogClient';
import { LocationPicker, useShop } from '@/components/CommerceClient';
import JsonLd from '@/components/JsonLd';
import { absoluteUrl, breadcrumbSchema } from '@/lib/seo';

export default function Shop() {
  const { categories, products, loading, delivery } = useShop();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Shop Pasalho products',
    url: absoluteUrl('/shop'),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
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
              ? `Showing live products from ${delivery.storeName}.`
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

      {loading ? (
        <p className="catalog-loading">Loading store catalogue…</p>
      ) : (
        <CatalogGrid />
      )}
    </div>
  );
}
