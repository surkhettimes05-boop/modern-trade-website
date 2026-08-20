import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'Contact us', description: 'Contact NOVA MART customer support or speak with us about stores, suppliers and partnerships in Nepal.', path: '/contact' });
export default function ContactLayout({ children }: { children: React.ReactNode }) { return children; }
