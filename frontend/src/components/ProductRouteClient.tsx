'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LocationPicker, ProductCard, useShop } from '@/components/CommerceClient';
import { BuyBox, ProductGallery } from '@/components/ProductDetailClient';
import { formatPrice, type Product } from '@/lib/catalog';
import { fetchPasalhoProduct } from '@/lib/pasalhoCommerce';

export default function ProductRouteClient({ slug }: { slug: string }) {
  const { products, categories, delivery, loading } = useShop();
  const knownProduct = products.find(
    (item) => item.slug === slug || item.sku === slug || item.id === slug,
  );
  const [remoteProduct, setRemoteProduct] = useState<Product | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!delivery || knownProduct) {
      setRemoteProduct(null);
      setDetailLoading(false);
      return;
    }

    let active = true;
    setDetailLoading(true);
    fetchPasalhoProduct(delivery.locationId, slug)
      .then((product) => {
        if (active) setRemoteProduct(product);
      })
      .catch(() => {
        if (active) setRemoteProduct(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [delivery, knownProduct, slug]);

  const product = knownProduct || remoteProduct;

  if (!delivery) {
    return (
      <div className="shell page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span>›</span><Link href="/shop">Shop</Link><span>›</span>
          <span>Product</span>
        </nav>
        <div className="location-required">
          <p className="eyebrow">CHECK LIVE AVAILABILITY</p>
          <h1>Set your location first</h1>
          <p>Product price and availability depend on the Pasalho store fulfilling your order.</p>
          <LocationPicker prominent />
        </div>
      </div>
    );
  }

  if (loading || detailLoading) {
    return <div className="shell page"><p>Checking {delivery.storeName}…</p></div>;
  }

  if (!product) {
    return (
      <div className="shell page empty-page">
        <h1>Not available at this store</h1>
        <p>The product may be out of assortment or unavailable at {delivery.storeName}.</p>
        <Link className="primary-btn" href="/shop">Browse live catalogue</Link>
      </div>
    );
  }

  const category = categories.find(
    (item) =>
      item.id === product.categoryId ||
      item.name.toLowerCase() === product.category.toLowerCase(),
  );
  const related = products
    .filter(
      (item) =>
        item.id !== product.id &&
        (item.categoryId === product.categoryId ||
          item.category === product.category),
    )
    .slice(0, 6);

  return (
    <div className="shell page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link><span>›</span><Link href="/shop">Shop</Link>
        {category ? (
          <>
            <span>›</span>
            <Link href={`/category/${category.slug}`}>{category.name}</Link>
          </>
        ) : null}
        <span>›</span><span aria-current="page">{product.name}</span>
      </nav>

      <div className="pdp">
        <ProductGallery product={product} />
        <BuyBox product={product} />
      </div>

      <div className="pdp-info">
        <section>
          <h2>Product details</h2>
          <p>{product.description || 'Product information from the Pasalho catalogue.'}</p>
        </section>
        <section>
          <h2>Specifications</h2>
          {Object.entries(product.specifications).map(([key, value]) => (
            <p key={key}><span>{key}</span><b>{value}</b></p>
          ))}
        </section>
        <section>
          <h2>Price & fulfillment</h2>
          <p>{formatPrice(product.price)} from {delivery.storeName}.</p>
          <p>Final stock and price are revalidated when you check out.</p>
        </section>
      </div>

      {related.length ? (
        <section className="section quick-section">
          <div className="section-title quick-title">
            <h2>More in {product.category}</h2>
            {category ? <Link href={`/category/${category.slug}`}>See category</Link> : null}
          </div>
          <div className="quick-product-grid">
            {related.map((item) => <ProductCard product={item} key={item.id} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
