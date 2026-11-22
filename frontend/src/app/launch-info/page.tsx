import Link from 'next/link';
import { isCreatorPortalEnabled, isMembershipPortalEnabled, isWebsiteCheckoutEnabled } from '@/lib/publicLaunch';

export const metadata = {
  title: 'PASALHO catalogue preview',
  description: 'Browse the PASALHO catalogue while customer registration and ordering are prepared.',
};

export default function LaunchInfo() {
  const webCheckoutEnabled = isWebsiteCheckoutEnabled();
  const membershipEnabled = isMembershipPortalEnabled();
  const creatorEnabled = isCreatorPortalEnabled();
  return (
    <section className="shell page mx-auto max-w-3xl py-14">
      <span className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-900">
        Public catalogue preview
      </span>
      <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950">Welcome to PASALHO</h1>
      <p className="mt-5 text-lg leading-8 text-slate-700">
        We are preparing our grocery shopping service in Birendranagar, Surkhet.
        You can browse products, categories, and stores now. {webCheckoutEnabled
          ? `Website cash-on-delivery checkout is open.${membershipEnabled ? ' Free membership enrollment is available after mobile verification; member pricing is not active yet.' : ' Membership enrollment is not open yet.'}${creatorEnabled ? ' Approved active creators can sign in to their portal; creator applications are handled by Pasalho.' : ' The creator portal is not open yet.'}`
          : 'Online checkout is not open. You can prepare a manual WhatsApp request from the cart; the store must confirm it before it becomes an order.'}
      </p>
      <p className="mt-4 font-semibold text-emerald-900">{webCheckoutEnabled
        ? 'Website orders use cash on delivery. The store reviews each order; payments by card or wallet are not active.'
        : 'No online checkout or payments are active. A WhatsApp message is only a request until the store confirms stock, price, delivery, and acceptance.'}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link className="rounded-lg bg-emerald-900 px-6 py-3 font-bold text-white" href="/shop">Browse products</Link>
        <Link className="rounded-lg border border-emerald-800 px-6 py-3 font-bold text-emerald-900" href="/stores">View stores</Link>
        {webCheckoutEnabled && <Link className="rounded-lg border border-emerald-800 px-6 py-3 font-bold text-emerald-900" href="/account">Sign in</Link>}
        {membershipEnabled && <Link className="rounded-lg border border-emerald-800 px-6 py-3 font-bold text-emerald-900" href="/membership">Membership</Link>}
        {creatorEnabled && <Link className="rounded-lg border border-emerald-800 px-6 py-3 font-bold text-emerald-900" href="/creator">Creator portal</Link>}
      </div>
    </section>
  );
}
