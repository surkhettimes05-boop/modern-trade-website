import Link from 'next/link';
export default function NotFound() {
  return <div className="shell page"><div className="empty-page"><p className="eyebrow">404 — NOT FOUND</p><h1>We couldn&apos;t find that page</h1><p>The address may be incorrect, or the product or page may no longer be available.</p><div><Link className="primary-btn" href="/shop">Browse products</Link> <Link className="secondary-btn" href="/">Return home</Link></div></div></div>;
}
