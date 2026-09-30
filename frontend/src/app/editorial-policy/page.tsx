import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Editorial policy',
  description: 'How Pasalho researches, sources and corrects practical shopping guidance.',
  path: '/editorial-policy',
});

export default function EditorialPolicyPage() {
  return (
    <article className="shell page max-w-4xl">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><span aria-current="page">Editorial policy</span></nav>
      <header>
        <p className="eyebrow">TRUST AND TRANSPARENCY</p>
        <h1 className="text-4xl font-bold">Editorial policy</h1>
        <p className="mt-4 text-xl leading-8 text-slate-700">
          Pasalho publishes practical guidance to help customers make informed shopping and handling decisions. Guidance should be useful, traceable and clearly separated from promotions.
        </p>
      </header>
      <div className="mt-10 space-y-8 text-base leading-7 text-slate-700">
        <section><h2 className="text-2xl font-bold text-slate-950">How guides are reviewed</h2><p className="mt-2">Operational claims should be checked against Pasalho&apos;s actual processes. Medical, legal or regulatory claims require an appropriate primary authority and are not presented as personalized professional advice.</p></section>
        <section><h2 className="text-2xl font-bold text-slate-950">How we use sources</h2><p className="mt-2">We prefer government agencies, public-health bodies, standards organizations and original research. We do not invent quotations, credentials, reviews or statistics.</p></section>
        <section><h2 className="text-2xl font-bold text-slate-950">Updates and corrections</h2><p className="mt-2">Material corrections should update the review date. Readers can report an issue through the <Link className="text-emerald-700 underline" href="/contact">contact page</Link>.</p></section>
        <section><h2 className="text-2xl font-bold text-slate-950">Commercial content</h2><p className="mt-2">Prices, availability and promotions may change by fulfillment store. Editorial guidance does not guarantee availability and does not replace the terms displayed for a specific order.</p></section>
      </div>
    </article>
  );
}
