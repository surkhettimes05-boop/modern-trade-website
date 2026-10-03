'use client';
import Link from 'next/link';
import { CatalogGrid } from '@/components/CatalogClient';
import { useShop } from '@/components/CommerceClient';
import JsonLd from '@/components/JsonLd';
import { absoluteUrl, breadcrumbSchema } from '@/lib/seo';

export default function Shop() {
  const { categories, products, loading, catalogAvailable } = useShop();
  const schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Shop all Pasalho products', url: absoluteUrl('/shop'), mainEntity: { '@type': 'ItemList', numberOfItems: products.length, itemListElement: products.map((product, index) => ({ '@type': 'ListItem', position: index + 1, name: product.name, url: absoluteUrl(`/product/${product.slug}`) })) } };
  return <div className="shell page"><JsonLd data={[schema, breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }])]} /><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><span aria-current="page">Shop</span></nav><div className="page-head"><div><p className="eyebrow">PASALHO ONLINE</p><h1>Shop all products</h1><p>Browse the opening assortment across 29 practical departments, with Nepalese-rupee pricing and store-based availability.</p></div></div><div className="chips">{categories.map((category) => <Link href={`/category/${category.slug}`} key={category.id}>{category.name}</Link>)}</div>{loading ? <p className="py-12 text-center">Loading products…</p> : !catalogAvailable ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center"><h2 className="text-xl font-bold text-amber-950">Online ordering is temporarily unavailable</h2><p className="mt-2 text-amber-800">We could not reach the live Pasalho catalog. Please try again shortly or use WhatsApp ordering.</p></section> : products.length ? <CatalogGrid /> : <p className="py-12 text-center text-slate-600">No products are currently published for online ordering.</p>}</div>;
}
