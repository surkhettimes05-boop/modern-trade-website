import { OperationsWorkbench } from '@/components/operations/OperationsWorkbench';

export default async function OperationsRoutePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <OperationsWorkbench route={slug.join('/')} />;
}
