import type { Metadata } from 'next';
import { Clock, MapPin, Phone } from 'lucide-react';
import JsonLd from '@/components/JsonLd';
import { absoluteUrl } from '@/lib/seo';
import { getCatalog } from '@/lib/serverCatalog';

export const metadata: Metadata = { title: 'Store locations | Pasalho', description: 'Published Pasalho store locations and contact information.' };
export default async function StoresPage() {
  const { stores } = await getCatalog();
  const schema = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'PASALHO stores', url: absoluteUrl('/stores'), numberOfItems: stores.length, itemListElement: stores.map((store, index) => ({ '@type': 'ListItem', position: index + 1, item: { '@type': 'GroceryStore', name: store.name, address: store.address, telephone: store.phone, openingHours: store.hours, geo: store.latitude != null && store.longitude != null ? { '@type': 'GeoCoordinates', latitude: store.latitude, longitude: store.longitude } : undefined } })) };
  return <div className="shell page"><JsonLd data={schema} /><div className="page-head"><div><p className="eyebrow">PASALHO LOCATIONS</p><h1>Store locations</h1><p>Published store details for visits and customer support. Online orders are delivered from the central warehouse.</p></div></div>{stores.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{stores.map((store) => <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" key={store.id}><MapPin className="text-emerald-700" /><h2 className="mt-3 text-xl font-bold">{store.name}</h2><p className="mt-2 text-slate-600">{store.address || 'Address unavailable'}</p><p className="mt-3 flex gap-2 text-sm text-slate-600"><Clock size={16} />{store.hours || 'Hours vary by day'}</p>{store.phone && <p className="mt-2 flex gap-2 text-sm text-slate-600"><Phone size={16} />{store.phone}</p>}{store.map_url && <a className="mt-5 inline-block text-sm font-semibold text-emerald-700" href={store.map_url} target="_blank" rel="noreferrer">Directions</a>}</article>)}</div> : <section className="rounded-xl border border-slate-200 bg-white p-8"><h2 className="text-xl font-semibold">Store directory unavailable</h2><p className="mt-2 text-slate-600">Published store details will appear here when the location directory is available.</p></section>}</div>;
}
