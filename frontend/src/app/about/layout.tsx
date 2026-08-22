import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'About us', description: 'Learn about NOVA MART, our Nepal retail mission, service principles and commitment to dependable everyday value.', path: '/about' });
export default function AboutLayout({ children }: { children: React.ReactNode }) { return children; }
