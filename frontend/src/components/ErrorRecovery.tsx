'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: '70vh',
    display: 'grid',
    placeItems: 'center',
    padding: '32px 20px',
    background: 'var(--pasalho-off-white)',
    color: 'var(--pasalho-dark)',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    width: 'min(100%, 560px)',
    padding: '32px',
    border: '1px solid var(--line)',
    borderRadius: '16px',
    background: 'var(--pasalho-white)',
    boxShadow: '0 12px 36px rgba(6,59,92,.08)',
    textAlign: 'center',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '24px',
  },
  primary: {
    minHeight: '46px',
    padding: '0 20px',
    border: 0,
    borderRadius: '9px',
    background: 'var(--pasalho-teal)',
    color: 'var(--pasalho-white)',
    fontWeight: 700,
  },
  secondary: {
    minHeight: '46px',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 20px',
    border: '1px solid var(--line)',
    borderRadius: '9px',
    background: 'var(--pasalho-white)',
    color: 'var(--pasalho-dark)',
    cursor: 'pointer',
    fontWeight: 700,
    textDecoration: 'none',
  },
  reference: { marginTop: '20px', color: 'var(--muted)', fontSize: '12px' },
};

export default function ErrorRecovery({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    console.error('Application render failed', { digest: error.digest });
  }, [error.digest]);

  return (
    <main style={styles.main}>
      <section
        aria-labelledby="recovery-title"
        aria-live="assertive"
        role="alert"
        style={styles.card}
      >
        <p style={{ color: '#063B5C', fontSize: '12px', fontWeight: 800 }}>
          PASALHO
        </p>
        <h1 id="recovery-title" ref={headingRef} tabIndex={-1}>
          We couldn&apos;t load this page
        </h1>
        <p>
          The problem may be temporary. Try the page again, or return to the
          storefront while the service recovers.
        </p>
        <div style={styles.actions}>
          <button onClick={retry} style={styles.primary} type="button">
            Try again
          </button>
          <Link href="/" style={styles.secondary}>
            Return home
          </Link>
        </div>
        {error.digest ? (
          <p style={styles.reference}>Reference: {error.digest}</p>
        ) : null}
      </section>
    </main>
  );
}
