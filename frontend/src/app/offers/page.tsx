import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import JsonLd from '@/components/JsonLd';
import { buildMetadata, absoluteUrl } from '@/lib/seo';
import { getCatalog } from '@/lib/serverCatalog';

export const metadata: Metadata = buildMetadata({ title: 'Current offers', description: 'See current NOVA MART grocery and household offers, campaign dates and terms for shoppers in Nepal.', path: '/offers' });

export default async function OffersPage() {
  const { offers, products } = await getCatalog();
  const featuredOffers = offers.filter((offer) => offer.is_featured);
  const regularOffers = offers.filter((offer) => !offer.is_featured);
  const dealProducts = products.filter((product) => product.originalPrice && product.originalPrice > product.price);
  const schema = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Current NOVA MART offers', url: absoluteUrl('/offers'),
    mainEntity: { '@type': 'ItemList', numberOfItems: offers.length + dealProducts.length, itemListElement: [
      ...offers.map((offer, index) => ({ '@type': 'ListItem', position: index + 1, name: offer.title })),
      ...dealProducts.map((product, index) => ({ '@type': 'ListItem', position: offers.length + index + 1, name: product.name, url: absoluteUrl(`/product/${product.slug}`) })),
    ] },
  };
  return <div className="min-h-screen bg-gray-50"><JsonLd data={schema} /><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <h1 className="text-4xl font-bold text-gray-900 mb-4">Current offers</h1>
    <p className="text-xl text-gray-600 mb-8">See active campaigns and opening-range savings, with dates and terms shown clearly.</p>
    {featuredOffers.length > 0 && <section className="mb-12"><h2 className="text-2xl font-semibold text-gray-900 mb-6">Featured offers</h2><div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{featuredOffers.map((offer) => <article key={offer.id} className="bg-white rounded-lg shadow-sm overflow-hidden">{offer.banner_image_url && <Image src={offer.banner_image_url} alt={offer.title} width={900} height={192} sizes="(max-width: 1024px) 100vw, 50vw" className="w-full h-48 object-cover" />}<div className="p-6"><h3 className="text-xl font-semibold text-gray-900 mb-2">{offer.title}</h3><p className="text-gray-600 mb-4">{offer.description}</p><p className="text-sm text-gray-500">Valid {new Date(offer.start_date).toLocaleDateString('en-NP')}–{new Date(offer.end_date).toLocaleDateString('en-NP')}</p>{offer.terms && <p className="text-sm text-gray-500 mt-2">{offer.terms}</p>}</div></article>)}</div></section>}
    {regularOffers.length > 0 && <section className="mb-12"><h2 className="text-2xl font-semibold text-gray-900 mb-6">All campaigns</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{regularOffers.map((offer) => <article key={offer.id} className="bg-white rounded-lg shadow-sm overflow-hidden">{offer.image_url && <Image src={offer.image_url} alt={offer.title} width={600} height={128} sizes="(max-width: 768px) 100vw, 33vw" className="w-full h-32 object-cover" />}<div className="p-4"><h3 className="font-semibold text-gray-900 mb-2">{offer.title}</h3><p className="text-sm text-gray-600 mb-3">{offer.description}</p><p className="text-xs text-gray-500">Valid {new Date(offer.start_date).toLocaleDateString('en-NP')}–{new Date(offer.end_date).toLocaleDateString('en-NP')}</p></div></article>)}</div></section>}
    {dealProducts.length > 0 && <section><h2 className="text-2xl font-semibold text-gray-900 mb-6">Opening-range savings</h2><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{dealProducts.map((product) => <article key={product.id} className="bg-white rounded-lg shadow-sm p-5"><p className="text-sm font-semibold text-emerald-700">Save NPR {Number(product.originalPrice) - product.price}</p><h3 className="text-lg font-bold mt-2">{product.name}</h3><p className="text-gray-600 mt-2">Now NPR {product.price}; regular price NPR {product.originalPrice}.</p><Link className="inline-block mt-4 font-semibold text-emerald-700" href={`/product/${product.slug}`}>View product →</Link></article>)}</div></section>}
    {offers.length === 0 && dealProducts.length === 0 && <section className="rounded-xl border border-slate-200 bg-white p-8"><h2 className="text-xl font-semibold">No active offers</h2><p className="mt-2 text-gray-600">There are no published campaigns at the moment. Browse the current catalog for store-based pricing.</p><Link className="primary-btn mt-5" href="/shop">Browse products</Link></section>}
  </div></div>;
}
