import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'Terms of use', description: 'Read the terms that apply when using NOVA MART websites and shopping services.', path: '/terms', noIndex: true });
export default function TermsLayout({ children }: { children: React.ReactNode }) { return children; }
