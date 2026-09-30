'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  PackageCheck,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  LocationPicker,
  ProductCard,
  useShop,
} from '@/components/CommerceClient';

function ProductRail({
  title,
  subtitle,
  products,
  href = '/shop',
}: {
  title: string;
  subtitle?: string;
  products: ReturnType<typeof useShop>['products'];
  href?: string;
}) {
  if (!products.length) return null;
  return (
    <section className="quick-section shell">
      <div className="quick-section-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <Link href={href}>
          See all <ArrowRight />
        </Link>
      </div>
      <div className="quick-product-row">
        {products.map((product) => (
          <ProductCard product={product} key={product.id} />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const { products, categories, loading, delivery, message } = useShop();

  const essentials = products.slice(0, 10);
  const deals = products
    .filter((product) => product.originalPrice)
    .slice(0, 10);
  const household = products
    .filter((product) =>
      /clean|laundry|dish|house|personal|baby|care/i.test(product.category),
    )
    .slice(0, 10);

  return (
    <>
      <section className="quick-hero shell">
        <div className="quick-hero-copy">
          <span className="quick-kicker">
            <Sparkles /> BIRENDRANAGAR PILOT
          </span>
          <h1>
            Everyday essentials,
            <br />
            without the long shop.
          </h1>
          <p>
            Set your location and Pasalho shows the store that can actually
            serve you, with live stock, store pricing and a realistic delivery
            estimate.
          </p>
          <LocationPicker prominent />
          <div className="quick-trust">
            <span><ShieldCheck /> COD</span>
            <span><PackageCheck /> Store-scoped stock</span>
            <span><BadgeCheck /> Server-checked prices</span>
          </div>
        </div>

        <div className="quick-hero-panel">
          <div className="quick-promise-card primary">
            <Clock3 />
            <span>Delivery estimate</span>
            <strong>
              {delivery
                ? `${delivery.etaMinMinutes}–${delivery.etaMaxMinutes} min`
                : 'Set your location'}
            </strong>
            <small>No fake 10-minute promise.</small>
          </div>
          <div className="quick-promise-card">
            <Search />
            <span>Built for repeat shopping</span>
            <strong>Search → Add → Checkout</strong>
            <small>Fewer screens between need and basket.</small>
          </div>
        </div>
      </section>

      {message ? <div className="shell commerce-message">{message}</div> : null}

      <section className="quick-section shell">
        <div className="quick-section-head">
          <div>
            <h2>Shop by category</h2>
            <p>Get to the product you need in one tap.</p>
          </div>
          <Link href="/shop">
            All categories <ArrowRight />
          </Link>
        </div>
        <div className="quick-category-grid">
          {categories.slice(0, 12).map((category, index) => (
            <Link
              href={`/category/${category.slug}`}
              className="quick-category-card"
              key={category.id}
            >
              <span className={`quick-category-icon tone-${(index % 6) + 1}`}>
                {category.name.slice(0, 1).toUpperCase()}
              </span>
              <b>{category.name}</b>
            </Link>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="shell catalog-loading">Loading the nearest store…</div>
      ) : (
        <>
          <ProductRail
            title={delivery ? 'Popular near you' : 'Everyday essentials'}
            subtitle={
              delivery
                ? `Live catalogue from ${delivery.storeName}`
                : 'Set your location for live Pasalho inventory.'
            }
            products={essentials}
          />
          <ProductRail
            title="Worth adding today"
            subtitle="Products currently priced below MRP."
            products={deals}
            href="/offers"
          />
          <ProductRail
            title="Home & personal care"
            subtitle="Useful household products, not endless browsing."
            products={household}
          />
        </>
      )}

      <section className="quick-value-strip">
        <div className="shell">
          <div>
            <strong>One Pasalho basket</strong>
            <span>Web, app and store inventory use the same backend truth.</span>
          </div>
          <div>
            <strong>Stock before promises</strong>
            <span>Availability is checked against the fulfillment store.</span>
          </div>
          <div>
            <strong>Simple payment</strong>
            <span>COD first; digital payments only after certification.</span>
          </div>
        </div>
      </section>
    </>
  );
}
