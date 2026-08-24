'use client';

import ErrorRecovery from '@/components/ErrorRecovery';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-NP">
      <body style={{ margin: 0 }}>
        <title>NOVA MART — Service unavailable</title>
        <ErrorRecovery error={error} retry={reset} />
      </body>
    </html>
  );
}
