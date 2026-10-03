import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'Contact us', description: 'Contact Pasalho about customer support, stores, suppliers and partnerships.', path: '/contact' });
export default function ContactLayout({ children }: { children: React.ReactNode }) { return children; }
