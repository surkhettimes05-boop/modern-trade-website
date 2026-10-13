'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityApi {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    element: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline';
      size: 'large';
      text: 'continue_with';
      shape: 'rectangular';
      width: number;
    },
  ): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdentityApi;
      };
    };
  }
}

export function GoogleSignInButton({
  disabled,
  onCredential,
}: {
  disabled?: boolean;
  onCredential: (credential: string) => void;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!clientId || !scriptReady || disabled || !buttonRef.current) return;
    const googleId = window.google?.accounts?.id;
    if (!googleId) return;

    buttonRef.current.replaceChildren();
    googleId.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) onCredential(response.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    googleId.renderButton(buttonRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 336,
    });
  }, [clientId, disabled, onCredential, scriptReady]);

  if (!clientId) return null;

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div
        ref={buttonRef}
        className={disabled ? 'pointer-events-none opacity-60' : ''}
        aria-busy={disabled || undefined}
      />
    </>
  );
}
