'use client';

import Script from 'next/script';
import { useState } from 'react';

interface FirebaseUser {
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

interface FirebaseAuthResult {
  user?: FirebaseUser | null;
}

interface FirebaseGoogleProvider {}

interface FirebaseAuth {
  signInWithPopup(provider: FirebaseGoogleProvider): Promise<FirebaseAuthResult>;
}

interface FirebaseNamespace {
  apps: unknown[];
  initializeApp(config: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    messagingSenderId?: string;
  }): unknown;
  auth: (() => FirebaseAuth) & {
    GoogleAuthProvider: new () => FirebaseGoogleProvider;
  };
}

declare global {
  interface Window {
    firebase?: FirebaseNamespace;
  }
}

function firebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_WEB_API?.trim();
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();

  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId, messagingSenderId };
}

export function FirebaseGoogleSignInButton({
  disabled,
  onCredential,
  onError,
}: {
  disabled?: boolean;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const config = firebaseConfig();
  const [appReady, setAppReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  if (!config) return null;

  const handleSignIn = async () => {
    const firebase = window.firebase;
    if (!firebase || !authReady) {
      onError('Google sign-in is still loading. Please try again.');
      return;
    }

    setSigningIn(true);
    try {
      if (firebase.apps.length === 0) {
        firebase.initializeApp(config);
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await firebase.auth().signInWithPopup(provider);
      if (!result.user) throw new Error('Firebase did not return a signed-in user');

      const idToken = await result.user.getIdToken(true);
      onCredential(idToken);
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      if (code.includes('popup-closed-by-user')) {
        onError('Google sign-in was cancelled.');
      } else if (code.includes('popup-blocked')) {
        onError('Your browser blocked the Google sign-in window. Allow popups and try again.');
      } else if (code.includes('unauthorized-domain')) {
        onError('This website domain is not authorized in Firebase yet.');
      } else {
        onError('Google sign-in could not be completed.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <>
      <Script
        src="https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js"
        strategy="afterInteractive"
        onLoad={() => setAppReady(true)}
      />
      {appReady && (
        <Script
          src="https://www.gstatic.com/firebasejs/12.19.0/firebase-auth-compat.js"
          strategy="afterInteractive"
          onLoad={() => setAuthReady(true)}
        />
      )}
      <button
        type="button"
        onClick={handleSignIn}
        disabled={disabled || signingIn || !authReady}
        className="w-full min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {signingIn ? 'Connecting to Google...' : 'Continue with Google'}
      </button>
    </>
  );
}
