'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight, PackageCheck, ShieldCheck, Store, Tags, Truck } from 'lucide-react';
import { LocationPicker, ProductCard, useShop } from '@/components/CommerceClient';

const hero = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1600&q=85';

function SectionTitle({ eyebrow, title, link = 'View all' }: { eyebrow?: string; title: string; link?: string }) {
  return <div className="section-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div><Link href="/shop">{link}<ArrowRight size={17} /></Link></div>;
}

export default function Home() {
  const { products, categories, offers, loading } = useShop();
  const deals = useMemo(
    () => products.filter((product) => product.originalPrice && product.originalPrice > product.price).slice(0, 8),
    [products],
  );
  const newArrivals = useMemo(
    () => [...products].sort((a, b) => Date.parse(b.createdAt || '1970-01-01') - Date.parse(a.createdAt || '1970-01-01')).slice(0, 8),
    [products],
  );
  const popular = useMemo(() => {
    const featured = products.filter((product) => product.featured);
    const available = products.filter((product) => !product.availability.toLowerCase().includes('out of'));
    return (featured.length ? featured : available).slice(0, 8);
  }, [products]);
  const promotion = offers.find((offer) => offer.is_featured) || offers[0];
  const promotionImage = promotion?.banner_image_url || promotion?.image_url || hero;

  return <>
    <section className="hero shell"><div className="hero-main"><Image src={hero} alt="Fresh groceries arranged for a weekly shop" fill priority unoptimized sizes="(max-width: 900px) 100vw, 70vw" /><div className="hero-copy"><span className="pill">PASALHO · BIRENDRANAGAR, SURKHET</span><h1>Everyday shopping,<br />closer to home.</h1><p>Groceries and household essentials in Birendranagar. Live NPR prices, delivery and pickup confirmed at checkout.</p><div><Link className="primary-btn" href="/shop">Shop now <ArrowRight /></Link><Link className="secondary-btn" href="#categories">Explore categories</Link></div></div></div><div className="hero-side"><Link href="/offers" className="side-offer tech-offer"><Image src="https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=85" alt="Colourful grocery products on store shelves" fill unoptimized sizes="(max-width: 800px) 50vw, 28vw" /><span>LIVE OFFERS</span><h2>Smart shopping.<br />Better value.</h2><b>See today&apos;s offers -&gt;</b></Link><Link href="/stores" className="side-offer home-offer"><Image src="https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=900&q=85" alt="A bright modern supermarket aisle" fill unoptimized sizes="(max-width: 800px) 50vw, 28vw" /><span>CHOOSE YOUR STORE</span><h2>Shop what&apos;s<br />near you.</h2><b>Find a store -&gt;</b></Link></div></section>

    <div className="service-strip shell"><span><Truck />Delivery fee based on your service area</span><span><PackageCheck />Store pickup available</span><span><ShieldCheck />Cash on delivery</span><span><Tags />Live store pricing and availability</span></div>

    <section className="shell mt-6">
      <Link href="/offers" className="relative block min-h-[220px] overflow-hidden rounded-3xl bg-slate-950 text-white shadow-sm">
        <Image src={promotionImage} alt="" fill unoptimized sizes="100vw" className="object-cover opacity-55" />
        <div className="relative z-10 max-w-2xl p-7 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-300">
            {promotion ? 'Pasalho promotion' : 'Pasalho launch'}
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            {promotion?.title || 'Shop local. Pay cash on delivery.'}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-100 sm:text-base">
            {promotion?.description || 'Real store pricing, confirmed stock, and convenient delivery or pickup in Birendranagar.'}
          </p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-950">
            Shop promotion <ArrowRight size={17} />
          </span>
        </div>
      </Link>
    </section>

    <section className="section shell" id="categories"><SectionTitle eyebrow="Shop faster" title="Shop by category" /><p className="catalog-note">Browse the live Pasalho assortment by department. Prices and availability come from the selected store.</p><div className="category-grid">{categories.map((category) => <Link href={`/category/${category.slug}`} className="category-card" key={category.id}><div>{category.image && <Image src={category.image} fill sizes="220px" alt="" />}</div><h3>{category.name}</h3><span>{category.skuCount ? `${category.skuCount} products` : 'Shop now'} <ArrowRight /></span></Link>)}</div></section>

    {deals.length > 0 && <section className="section warm"><div className="shell"><SectionTitle eyebrow="Save on your regulars" title="Deals" link="See all deals" />{loading ? <p>Loading catalog...</p> : <div className="product-scroll">{deals.map((product) => <ProductCard product={product} key={product.id} />)}</div>}</div></section>}

    {newArrivals.length > 0 && <section className="section shell"><SectionTitle eyebrow="Freshly added" title="New arrivals" /><div className="product-scroll">{newArrivals.map((product) => <ProductCard product={product} key={product.id} />)}</div></section>}

    {popular.length > 0 && <section className="section near"><div className="shell"><div className="near-head"><SectionTitle eyebrow="Popular picks" title="Popular right now" /><LocationPicker /></div><p className="subtle">Featured products first, with availability based on the selected store.</p><div className="product-scroll">{popular.map((product) => <ProductCard product={product} key={product.id} />)}</div></div></section>}

    <section className="section shell"><SectionTitle eyebrow="Your regulars, ready" title="Everyday essentials" link="Shop all essentials" /><div className="essentials-grid">{products.slice(0, 8).map((product) => <ProductCard compact product={product} key={product.id} />)}</div></section>

    <section className="section shell"><SectionTitle eyebrow="The Pasalho promise" title="More value in every visit" link="Our quality promise" /><div className="benefits"><div><Tags /><h3>Clear NPR prices</h3><p>Know the current selling price before you add to cart.</p></div><div><ShieldCheck /><h3>Real product photos</h3><p>Recognize the exact brand and pack before ordering.</p></div><div><PackageCheck /><h3>Live availability</h3><p>Store stock determines whether an item can be ordered.</p></div><div><Store /><h3>Local fulfilment</h3><p>Delivery and pickup are handled from your Pasalho store.</p></div></div></section>
  </>;
}
