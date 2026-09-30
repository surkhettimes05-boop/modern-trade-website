'use client';

import Link from 'next/link';
import { CatalogGrid } from '@/components/CatalogClient';
import { LocationPicker, useShop } from '@/components/CommerceClient';

export default function CategoryRouteClient({ slug }: { slug: string }) {
  const { categories, products, loading, delivery } = useShop();
  const category = categories.find((item) => item.slug === slug);
  const list = category
    ? products.filter(
        (product) =>
          product.categoryId === category.id ||
          product.category.toLowerCase() === category.name.toLowerCase(),
      )
    : [];

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

  if (loading) {
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
          <p>{list.length} currently orderable product{list.length === 1 ? '' : 's'}.</p>
        </div>
        <LocationPicker />
      </div>
      {list.length ? (
        <CatalogGrid initial={list} />
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
