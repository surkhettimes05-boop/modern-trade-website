import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'Shop all products', description: 'Browse NOVA MART groceries, drinks, personal care and household essentials available across Nepal.', path: '/shop' });
export default function ShopLayout({ children }: { children: React.ReactNode }) { return children; }
