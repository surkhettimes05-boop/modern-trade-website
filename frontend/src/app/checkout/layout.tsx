import { privateMetadata } from '@/lib/seo';
export const metadata = privateMetadata('Secure checkout', '/checkout');
export default function CheckoutLayout({ children }: { children: React.ReactNode }) { return children; }
