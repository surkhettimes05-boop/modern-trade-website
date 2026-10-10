import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'About Pasalho', description: 'Learn about Pasalho and our focus on everyday shopping for customers in Birendranagar, Surkhet.', path: '/about' });
export default function AboutLayout({ children }: { children: React.ReactNode }) { return children; }
