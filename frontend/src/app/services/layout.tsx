import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'Services', description: 'Learn about NOVA MART shopping, pickup, delivery, checkout and customer support services.', path: '/services' });
export default function ServicesLayout({ children }: { children: React.ReactNode }) { return children; }
