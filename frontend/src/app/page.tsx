'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, PackageCheck, ShieldCheck, Store, Tags, Truck } from 'lucide-react';
import { LocationPicker, ProductCard, useShop } from '@/components/CommerceClient';
import { formatPrice } from '@/lib/market';

const hero = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1600&q=85';

function SectionTitle({ eyebrow, title, link = 'View all' }: { eyebrow?: string; title: string; link?: string }) {
  return <div className="section-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div><Link href="/shop">{link}<ArrowRight size={17} /></Link></div>;
}

export default function Home() {
  const { products, categories, loading } = useShop();
  return <>
    <section className="hero shell"><div className="hero-main"><Image src={hero} alt="Fresh groceries arranged for a weekly shop" fill priority unoptimized sizes="(max-width: 900px) 100vw, 70vw" /><div className="hero-copy"><span className="pill">THIS WEEK AT NOVA MART</span><h1>Big savings for<br />everyday living.</h1><p>Groceries, home essentials, electronics and more - quality products at prices made for everyday life.</p><div><Link className="primary-btn" href="/shop">Shop today&apos;s deals <ArrowRight /></Link><Link className="secondary-btn" href="#categories">Explore categories</Link></div></div></div><div className="hero-side"><Link href="/offers" className="side-offer tech-offer"><Image src="https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=85" alt="Colourful grocery products on store shelves" fill unoptimized sizes="(max-width: 800px) 50vw, 28vw" /><span>LIVE OFFERS</span><h2>Smart shopping.<br />Better value.</h2><b>See today&apos;s offers -&gt;</b></Link><Link href="/stores" className="side-offer home-offer"><Image src="https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=900&q=85" alt="A bright modern supermarket aisle" fill unoptimized sizes="(max-width: 800px) 50vw, 28vw" /><span>CHOOSE YOUR STORE</span><h2>Shop what&apos;s<br />near you.</h2><b>Find a store -&gt;</b></Link></div></section>
    <div className="service-strip shell"><span><Truck />Free delivery over {formatPrice(9_999)}</span><span><PackageCheck />Pickup ready in 2 hours</span><span><ShieldCheck />COD checkout</span><span><Tags />IRD/VAT-compatible receipts</span></div>
    <section className="section shell" id="categories"><SectionTitle eyebrow="StoreSync opening range" title="642 SKUs, organized to sell" /><p className="catalog-note">The lean launch assortment from your Opening SKU Plan v2: 300 Core, 270 Standard and 72 Test SKUs across 29 departments.</p><div className="category-grid">{categories.map((category) => <Link href={`/category/${category.slug}`} className="category-card" key={category.id}><div>{category.image && <Image src={category.image} fill sizes="220px" alt="" />}</div><h3>{category.name}</h3><span>{category.skuCount ? `${category.skuCount} SKUs` : 'Shop now'} <ArrowRight /></span></Link>)}</div></section>
    <section className="section warm"><div className="shell"><SectionTitle eyebrow="Worth adding to cart" title="Today&apos;s best deals" />{loading ? <p>Loading catalog...</p> : <div className="product-scroll">{products.filter((p) => p.originalPrice).slice(0, 6).map((product) => <ProductCard product={product} key={product.id} />)}</div>}</div></section>
    <section className="section shell"><SectionTitle eyebrow="Your regulars, ready" title="Everyday essentials" link="Shop all essentials" /><div className="essentials-grid">{products.slice(0, 8).map((product) => <ProductCard compact product={product} key={product.id} />)}</div></section>
    <section className="section near"><div className="shell"><div className="near-head"><SectionTitle eyebrow="Picked for your neighbourhood" title="Popular near you" /><LocationPicker /></div><p className="subtle">Selection and offers may vary by store and delivery location.</p><div className="product-scroll">{products.slice(8, 13).map((product) => <ProductCard product={product} key={product.id} />)}</div></div></section>
    <section className="section shell"><SectionTitle eyebrow="The NOVA promise" title="More value in every visit" link="Our quality promise" /><div className="benefits"><div><Tags /><h3>Everyday low prices</h3><p>Great value across thousands of essentials.</p></div><div><ShieldCheck /><h3>Quality you can trust</h3><p>Carefully selected products and trusted brands.</p></div><div><PackageCheck /><h3>Everything in one place</h3><p>Groceries, home, electronics and more.</p></div><div><Store /><h3>Stores close to home</h3><p>Convenient locations built around communities.</p></div></div></section>
  </>;
}
