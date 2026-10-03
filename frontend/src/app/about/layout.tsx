import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'About us', description: 'Learn about Pasalho, our store-led retail model, service principles and approach to everyday shopping.', path: '/about' });
export default function AboutLayout({ children }: { children: React.ReactNode }) { return children; }
