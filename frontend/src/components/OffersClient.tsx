'use client';

import Link from 'next/link';
import { LocationPicker, ProductCard, useShop } from '@/components/CommerceClient';

export default function OffersClient() {
  const { products, delivery, loading } = useShop();
  const deals = products.filter(
    (product) =>
      product.originalPrice != null &&
      product.originalPrice > product.price,
  );

  return (
    <div className="shell page quick-shop-page">
      <div className="quick-shop-head">
        <div>
          <p className="eyebrow">PASALHO PRICE DROPS</p>
          <h1>Current savings</h1>
          <p>
            {delivery
              ? `Showing products currently priced below MRP at ${delivery.storeName}.`
              : 'Set your location to see real store-level savings.'}
          </p>
        </div>
        <LocationPicker />
      </div>

      {loading ? <p className="catalog-loading">Checking current prices…</p> : null}

      {!loading && !delivery ? (
        <div className="location-required">
          <h2>Offers depend on your fulfillment store</h2>
          <p>Pasalho does not advertise a discount that your selected store cannot actually fulfill.</p>
          <LocationPicker prominent />
        </div>
      ) : null}

      {!loading && delivery && deals.length ? (
        <div className="quick-product-grid">
          {deals.map((product) => <ProductCard product={product} key={product.id} />)}
        </div>
      ) : null}

      {!loading && delivery && !deals.length ? (
        <div className="empty-page">
          <h2>No active price reductions right now</h2>
          <p>Browse the live catalogue for current store pricing.</p>
          <Link className="primary-btn" href="/shop">Browse products</Link>
        </div>
      ) : null}
    </div>
  );
}
