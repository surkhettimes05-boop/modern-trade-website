import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'Frequently asked questions', description: 'Answers about NOVA MART store hours, delivery, payments and customer support in Nepal.', path: '/faq' });
export default function FaqLayout({ children }: { children: React.ReactNode }) { return children; }
