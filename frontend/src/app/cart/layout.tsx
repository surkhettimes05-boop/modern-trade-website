import { privateMetadata } from '@/lib/seo';
export const metadata = privateMetadata('Shopping cart', '/cart');
export default function CartLayout({ children }: { children: React.ReactNode }) { return children; }
