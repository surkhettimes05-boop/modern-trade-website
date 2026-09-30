import Link from 'next/link';
import { Headphones, MapPin, PackageCheck, ShieldCheck } from 'lucide-react';

const customerLinks = [
  { label: 'Shop all', href: '/shop' },
  { label: 'Offers', href: '/offers' },
  { label: 'My orders', href: '/account/orders' },
  { label: 'My account', href: '/account' },
];

const helpLinks = [
  { label: 'Help & FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
  { label: 'Delivery information', href: '/services' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

export default function Footer() {
  return (
    <footer className="pasalho-footer">
      <div className="shell pasalho-footer-grid">
        <div className="pasalho-footer-brand">
          <Link href="/" className="pasalho-logo light" aria-label="Pasalho home">
            <span className="pasalho-logo-mark">P</span>
            <span className="pasalho-logo-word">pasalho</span>
          </Link>
          <p>
            A modern grocery and essentials experience built around real store
            inventory in Surkhet.
          </p>
        </div>

        <div>
          <h3>Shop</h3>
          {customerLinks.map((link) => (
            <Link href={link.href} key={link.href}>{link.label}</Link>
          ))}
        </div>

        <div>
          <h3>Help</h3>
          {helpLinks.map((link) => (
            <Link href={link.href} key={link.href}>{link.label}</Link>
          ))}
        </div>

        <div className="pasalho-footer-promises">
          <span><MapPin /> Store-based availability</span>
          <span><PackageCheck /> Checked at checkout</span>
          <span><ShieldCheck /> COD-first launch</span>
          <span><Headphones /> Local customer support</span>
        </div>
      </div>
      <div className="footer-bottom shell">
        <span>© 2026 Pasalho</span>
        <span>Birendranagar · Surkhet · Nepal</span>
        <span>NPR · Cash on delivery</span>
      </div>
    </footer>
  );
}
