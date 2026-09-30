import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BadgeCheck,
  Headphones,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Delivery and shopping',
  description:
    'How Pasalho handles store assignment, live stock, delivery, COD checkout and customer support.',
  path: '/services',
});

const services = [
  {
    icon: MapPin,
    title: 'Location-based store assignment',
    description:
      'Your delivery location is matched to an eligible Pasalho fulfillment store before live inventory is shown.',
  },
  {
    icon: PackageCheck,
    title: 'Store-scoped stock',
    description:
      'Products and availability come from the selected store rather than a generic website stock number.',
  },
  {
    icon: Truck,
    title: 'Local delivery',
    description:
      'Delivery is available only inside active Pasalho service zones. The current delivery fee and ETA are checked before order placement.',
  },
  {
    icon: ShieldCheck,
    title: 'Cash on delivery',
    description:
      'COD is the certified customer payment method for the current launch. Digital payments stay disabled until their integrations are production-ready.',
  },
  {
    icon: BadgeCheck,
    title: 'Order tracking',
    description:
      'Signed-in customers can follow the Pasalho order lifecycle from placement through picking, packing, dispatch and delivery.',
  },
  {
    icon: Headphones,
    title: 'Customer support',
    description:
      'Use the Pasalho contact and help pages for delivery, order or account questions.',
  },
];

export default function ServicesPage() {
  return (
    <div className="shell page">
      <p className="eyebrow">HOW PASALHO WORKS</p>
      <div className="page-head">
        <div>
          <h1>Simple shopping backed by real store operations.</h1>
          <p>
            Pasalho keeps the customer experience focused on what is useful:
            the right store, current stock, clear pricing, practical delivery
            and reliable order tracking.
          </p>
        </div>
      </div>

      <div className="service-cards-grid">
        {services.map(({ icon: Icon, title, description }) => (
          <article className="service-card" key={title}>
            <div className="service-card-icon">
              <Icon aria-hidden="true" />
            </div>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </div>

      <section className="service-cta">
        <div>
          <h2>Check what Pasalho can deliver to you.</h2>
          <p>
            Set your location to load the live catalogue from the fulfillment
            store that can serve your area.
          </p>
        </div>
        <Link className="primary-btn" href="/shop">
          Browse live catalogue
        </Link>
      </section>
    </div>
  );
}
