import type { Metadata } from 'next';
import Link from 'next/link';
import JsonLd from '@/components/JsonLd';
import { absoluteUrl, breadcrumbSchema, buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'Shopping guides', description: 'Practical, source-backed NOVA MART guides for buying, handling and storing everyday groceries safely in Nepal.', path: '/guides' });

export default function GuidesPage() {
  const schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'NOVA MART shopping guides', url: absoluteUrl('/guides'), mainEntity: { '@type': 'ItemList', numberOfItems: 1, itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Safer grocery shopping and storage', url: absoluteUrl('/guides/safer-grocery-storage') }] } };
  return <div className="shell page"><JsonLd data={[schema, breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Guides', path: '/guides' }])]} /><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><span aria-current="page">Guides</span></nav><div className="page-head"><div><p className="eyebrow">PRACTICAL, SOURCE-BACKED ADVICE</p><h1>Shopping guides</h1><p>Clear guidance reviewed by the NOVA MART retail operations team and linked to primary public-health sources.</p></div></div><article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><p className="text-sm font-semibold text-emerald-700">Food safety · 6 minute read</p><h2 className="mt-3 text-2xl font-bold"><Link href="/guides/safer-grocery-storage">Safer grocery shopping and storage</Link></h2><p className="mt-3 text-slate-600">A five-step checklist for inspecting packages, separating food, controlling temperature and using products before expiry.</p><Link className="mt-5 inline-block font-semibold text-emerald-700" href="/guides/safer-grocery-storage">Read the guide →</Link></article></div>;
}
