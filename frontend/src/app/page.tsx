'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight, CheckCircle2, MapPin, PackageCheck, ShieldCheck, Store, Tags, Truck } from 'lucide-react';
import { LocationPicker, ProductCard, useShop } from '@/components/CommerceClient';

const hero = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1800&q=90';
const fallbackTiles = [
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=720&q=85',
  'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=720&q=85',
  'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=720&q=85',
];

function SectionTitle({ eyebrow, title, href = '/shop', link = 'View all' }: { eyebrow?: string; title: string; href?: string; link?: string }) {
  return <div className="section-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div><Link href={href}>{link}<ArrowRight size={17} /></Link></div>;
}

export default function Home() {
  const { products, categories, offers, campaigns, stores, selectedStore, loading, browseOnly, webCheckoutEnabled } = useShop();
  const deals = useMemo(() => products.filter((product) => product.originalPrice && product.originalPrice > product.price).slice(0, 8), [products]);
  const newArrivals = useMemo(() => [...products].sort((a, b) => Date.parse(b.createdAt || '1970-01-01') - Date.parse(a.createdAt || '1970-01-01')).slice(0, 8), [products]);
  const popular = useMemo(() => {
    const featured = products.filter((product) => product.featured);
    const available = products.filter((product) => !product.availability.toLowerCase().includes('out of'));
    return (featured.length ? featured : available).slice(0, 8);
  }, [products]);
  const campaignsVisible = !browseOnly || webCheckoutEnabled;
  const publicCampaigns = campaignsVisible ? campaigns : [];
  const heroCampaign = publicCampaigns.find((campaign) => campaign.placements?.includes('HOME_HERO')) || publicCampaigns.find((campaign) => campaign.is_featured);
  const offerCampaign = publicCampaigns.find((campaign) => campaign.placements?.includes('OFFERS_PAGE')) || publicCampaigns.find((campaign) => campaign.is_featured);
  const legacyOffer = campaignsVisible ? (offers.find((offer) => offer.is_featured) || offers[0]) : undefined;
  const heroImage = heroCampaign?.banner_image_url || heroCampaign?.image_url || hero;
  const heroOffer = heroCampaign?.promotion?.promotion_type === 'PERCENTAGE'
    ? `${Number(heroCampaign.promotion.discount_value).toLocaleString('en-NP')}% OFF eligible items${heroCampaign.promotion.minimum_order_value ? ` · min. ${heroCampaign.promotion.minimum_order_value} NPR` : ''}${heroCampaign.promotion.maximum_discount_amount ? ` · up to ${heroCampaign.promotion.maximum_discount_amount} NPR` : ''}`
    : null;
  const heroTitle = heroCampaign?.title_en || 'Fresh groceries, closer to home.';
  const heroDescription = heroCampaign?.description_en || (selectedStore
    ? `Browse the PASALHO catalogue from ${selectedStore.name}. Choose what you need and check local availability.`
    : 'Choose a nearby PASALHO store to explore groceries, household essentials, and local offers.');
  const tiles = [
    {
      eyebrow: 'CURRENT OFFER',
      title: offerCampaign?.title_en || legacyOffer?.title || 'Weekly offers',
      description: offerCampaign?.description_en || legacyOffer?.description || 'See the latest PASALHO offers and campaign details.',
      image: offerCampaign?.banner_image_url || offerCampaign?.image_url || legacyOffer?.banner_image_url || legacyOffer?.image_url || fallbackTiles[0],
      href: '/offers',
      tone: 'lime',
    },
    {
      eyebrow: 'FRESH PICKS',
      title: categories[0]?.name || 'Fresh groceries',
      description: 'Fruit, vegetables, and everyday favourites.',
      image: categories[0]?.image || fallbackTiles[1],
      href: categories[0] ? `/category/${categories[0].slug}` : '/shop',
      tone: 'teal',
    },
    {
      eyebrow: 'SHOP THE RANGE',
      title: categories[1]?.name || 'Pantry essentials',
      description: 'Stock up on the things your home uses most.',
      image: categories[1]?.image || fallbackTiles[2],
      href: categories[1] ? `/category/${categories[1].slug}` : '/shop',
      tone: 'gold',
    },
    {
      eyebrow: 'NEAR YOU',
      title: 'Choose your PASALHO store',
      description: stores.length ? `${stores.length} local stores to explore.` : 'Find a store serving your area.',
      image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=720&q=85',
      href: '/stores',
      tone: 'blue',
    },
  ];

  return <>
    <section className="quick-hero shell">
      <Image className="quick-hero-image" src={heroImage} alt="Fresh vegetables and groceries at a local market" fill priority unoptimized sizes="100vw" />
      <div className="quick-hero-copy">
        <span className="quick-hero-kicker"><MapPin size={14} /> BIRENDRANAGAR · SURKHET</span>
        {heroOffer && heroCampaign && <span className="quick-hero-offer">{heroOffer} · {heroCampaign.title_en}</span>}
        <h1>{heroTitle}</h1>
        <p>{heroDescription}</p>
        <div className="quick-hero-actions">
          <Link className="quick-hero-cta" href={heroCampaign?.cta_url || '/shop'}>{heroCampaign?.cta_text_en || 'Shop groceries'} <ArrowRight size={19} /></Link>
          <Link className="quick-hero-secondary" href="/stores">Find a store</Link>
        </div>
        <div className="quick-hero-note"><CheckCircle2 size={16} /> {browseOnly ? webCheckoutEnabled ? 'Cash on delivery available' : 'Browse the published catalogue' : 'Local delivery and store pickup'}</div>
      </div>
    </section>

    <section className="quick-promos shell" aria-label="Explore PASALHO">
      {tiles.map((tile) => <Link href={tile.href} className={`quick-promo quick-promo-${tile.tone}`} key={`${tile.eyebrow}-${tile.title}`}>
        <Image src={tile.image} alt="" fill unoptimized sizes="(max-width: 700px) 80vw, 25vw" />
        <span className="quick-promo-eyebrow">{tile.eyebrow}</span>
        <div className="quick-promo-copy"><h2>{tile.title}</h2><p>{tile.description}</p><b>Explore <ArrowRight size={15} /></b></div>
      </Link>)}
    </section>

    <div className="quick-service shell">
      <span><Truck /> Local delivery</span><span><PackageCheck /> Store pickup</span><span><ShieldCheck /> Cash on delivery</span><span><Tags /> Fresh offers</span>
    </div>

    <section className="section shell" id="categories">
      <SectionTitle eyebrow="Explore the range" title="Shop by category" />
      <p className="catalog-note">{browseOnly ? 'Browse published PASALHO products. Availability is confirmed by your selected store.' : 'Explore the local assortment and choose a nearby store for availability.'}</p>
      <div className="category-grid">{categories.map((category) => <Link href={`/category/${category.slug}`} className="category-card" key={category.id}><div>{category.image && <Image src={category.image} fill sizes="220px" alt="" />}</div><h3>{category.name}</h3><span>{category.skuCount ? `${category.skuCount} products` : 'View products'} <ArrowRight /></span></Link>)}</div>
    </section>

    {!browseOnly && deals.length > 0 && <section className="section warm"><div className="shell"><SectionTitle eyebrow="Save on your regulars" title="Deals" link="See all deals" href="/offers" />{loading ? <p>Loading catalogue…</p> : <div className="product-scroll">{deals.map((product) => <ProductCard product={product} key={product.id} />)}</div>}</div></section>}

    {!browseOnly && newArrivals.length > 0 && <section className="section shell"><SectionTitle eyebrow="Freshly added" title="New arrivals" /><div className="product-scroll">{newArrivals.map((product) => <ProductCard product={product} key={product.id} />)}</div></section>}

    {popular.length > 0 && <section className="section near"><div className="shell"><div className="near-head"><SectionTitle eyebrow={browseOnly ? 'Published listings' : 'Popular picks'} title={browseOnly ? 'Popular PASALHO products' : 'Popular right now'} /><LocationPicker /></div><p className="subtle">{browseOnly ? 'Choose a store to see availability near you.' : 'Availability is based on the selected PASALHO store.'}</p><div className="product-scroll">{popular.map((product) => <ProductCard product={product} key={product.id} />)}</div></div></section>}

    {!browseOnly && <section className="section shell"><SectionTitle eyebrow="Your regulars, ready" title="Everyday essentials" link="Shop all essentials" /><div className="essentials-grid">{products.slice(0, 8).map((product) => <ProductCard compact product={product} key={product.id} />)}</div></section>}

    <section className="quick-promise shell"><div><Store /><span><b>Local stores</b><small>Shop from your neighbourhood</small></span></div><div><ShieldCheck /><span><b>Clear prices</b><small>Review your order before checkout</small></span></div><div><Truck /><span><b>Flexible fulfilment</b><small>Delivery or store pickup</small></span></div></section>
  </>;
}
