import { privateMetadata } from '@/lib/seo';
export const metadata = privateMetadata('Customer account', '/account');
export default function AccountLayout({ children }: { children: React.ReactNode }) { return children; }
