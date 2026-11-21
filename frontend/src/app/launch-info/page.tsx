import Link from 'next/link';

export const metadata = {
  title: 'PASALHO catalogue preview',
  description: 'Browse the PASALHO catalogue while customer registration and ordering are prepared.',
};

export default function LaunchInfo() {
  return (
    <section className="shell page mx-auto max-w-3xl py-14">
      <span className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-900">
        Public catalogue preview
      </span>
      <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950">Welcome to PASALHO</h1>
      <p className="mt-5 text-lg leading-8 text-slate-700">
        We are preparing our grocery shopping service in Birendranagar, Surkhet.
        You can browse products, categories, and stores now. Customer accounts,
        memberships, creator sign-up, and all ordering channels will open after launch checks.
      </p>
      <p className="mt-4 font-semibold text-emerald-900">No payments or customer orders are being accepted at this time.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link className="rounded-lg bg-emerald-900 px-6 py-3 font-bold text-white" href="/shop">Browse products</Link>
        <Link className="rounded-lg border border-emerald-800 px-6 py-3 font-bold text-emerald-900" href="/stores">View stores</Link>
      </div>
    </section>
  );
}
