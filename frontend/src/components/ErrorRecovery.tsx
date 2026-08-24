'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: '70vh',
    display: 'grid',
    placeItems: 'center',
    padding: '32px 20px',
    background: '#f6f3eb',
    color: '#17221b',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    width: 'min(100%, 560px)',
    padding: '32px',
    border: '1px solid #dedfd9',
    borderRadius: '16px',
    background: '#fff',
    boxShadow: '0 12px 36px rgba(23,34,27,.09)',
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
    background: '#075d43',
    color: '#fff',
    fontWeight: 700,
  },
  secondary: {
    minHeight: '46px',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 20px',
    border: '1px solid #cfd4cf',
    borderRadius: '9px',
    background: '#fff',
    color: '#17221b',
    cursor: 'pointer',
    fontWeight: 700,
    textDecoration: 'none',
  },
  reference: { marginTop: '20px', color: '#667069', fontSize: '12px' },
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
        <p style={{ color: '#075d43', fontSize: '12px', fontWeight: 800 }}>
          NOVA MART
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
