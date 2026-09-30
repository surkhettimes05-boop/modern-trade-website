import type { Metadata } from 'next';
import OffersClient from '@/components/OffersClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Current savings',
  description: 'See Pasalho products currently priced below MRP at your selected fulfillment store.',
  path: '/offers',
});

export default function OffersPage() {
  return <OffersClient />;
}
