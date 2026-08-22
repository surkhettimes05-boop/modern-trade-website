import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'Privacy policy', description: 'Read how NOVA MART handles personal information, customer choices and privacy in Nepal.', path: '/privacy', noIndex: true });
export default function PrivacyLayout({ children }: { children: React.ReactNode }) { return children; }
