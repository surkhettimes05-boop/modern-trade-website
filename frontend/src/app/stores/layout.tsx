import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'Store locations', description: 'Find NOVA MART store locations, opening hours, services and contact information in Nepal.', path: '/stores' });
export default function StoresLayout({ children }: { children: React.ReactNode }) { return children; }
