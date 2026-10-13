import Link from 'next/link';
import { AtSign, BriefcaseBusiness, Camera, MessageCircle } from 'lucide-react';

type FooterLink = { label: string; href: string };

const cols: Record<string, FooterLink[]> = {
  Shop: [
    { label: 'All products', href: '/shop' }, { label: 'Rice', href: '/category/rice' },
    { label: 'Dal & pulses', href: '/category/dal-pulses' }, { label: 'Milk & dairy', href: '/category/milk-dairy' },
    { label: 'Household cleaning', href: '/category/household-cleaning' }, { label: 'Today’s deals', href: '/offers' },
  ],
  'Customer Service': [
    { label: 'Help centre', href: '/faq' }, { label: 'Shopping guides', href: '/guides' }, { label: 'Track an order', href: '/account/orders' },
    { label: 'Delivery & pickup', href: '/services' },
    { label: 'Contact us', href: '/contact' },
  ],
  'About Pasalho': [
    { label: 'Our story', href: '/about' }, { label: 'Sustainability', href: '/about' },
    { label: 'Quality promise', href: '/about' }, { label: 'Our community', href: '/about' },
  ],
  Corporate: [
    { label: 'Investors', href: '/about' }, { label: 'Newsroom', href: '/about' },
    { label: 'Suppliers', href: '/contact' }, { label: 'Real estate', href: '/contact' },
  ],
  'Work With Us': [
    { label: 'Careers', href: '/about' }, { label: 'Sell with us', href: '/contact' },
    { label: 'Franchise', href: '/contact' }, { label: 'Partner portal', href: '/contact' },
  ],
  Policies: [
    { label: 'Privacy', href: '/privacy' }, { label: 'Terms of use', href: '/terms' }, { label: 'Editorial policy', href: '/editorial-policy' },
    { label: 'Accessibility', href: '/about#accessibility' }, { label: 'Cookie choices', href: '/privacy#cookies' },
  ],
};

const socialLinks = [
  { label: 'Contact Pasalho', href: '/contact', icon: MessageCircle },
  { label: 'Find a Pasalho store', href: '/stores', icon: Camera },
  { label: 'Open your Pasalho account', href: '/account', icon: AtSign },
  { label: 'Work with Pasalho', href: '/about', icon: BriefcaseBusiness },
];

export default function Footer() {
  return <footer>
    <div className="footer-top shell">
      <Link href="/" className="logo light" aria-label="Pasalho home"><i>P</i><span>PASALHO</span></Link>
      <p>Everyday value for Birendranagar.<br />Proudly serving Surkhet.</p>
      <nav className="socials" aria-label="Pasalho links">
        {socialLinks.map(({ label, href, icon: Icon }) => <Link href={href} key={label} aria-label={label} title={label}><Icon aria-hidden="true" /></Link>)}
      </nav>
    </div>
    <div className="footer-grid shell">{Object.entries(cols).map(([heading, links]) => <div key={heading}><h3>{heading}</h3>{links.map(({ label, href }) => <Link href={href} key={label}>{label}</Link>)}</div>)}</div>
    <div className="footer-bottom shell"><span>© 2026 Pasalho</span><span>Birendranagar, Surkhet · Nepal</span><span>Cash on delivery · Store pickup</span></div>
  </footer>;
}
