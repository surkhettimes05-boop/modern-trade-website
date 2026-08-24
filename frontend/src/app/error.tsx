'use client';

import ErrorRecovery from '@/components/ErrorRecovery';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRecovery error={error} retry={reset} />;
}
