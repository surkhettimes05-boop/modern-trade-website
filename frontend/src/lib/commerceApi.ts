'use client';

type ApiErrorBody = {
  success?: false;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

type ApiEnvelope<T> = {
  success: true;
  data: T;
};

type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

const ACCESS_KEY = 'pasalho_customer_access_token';
const REFRESH_KEY = 'pasalho_customer_refresh_token';

export class CommerceApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function storage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function getCommerceAccessToken() {
  return storage()?.getItem(ACCESS_KEY) ?? null;
}

export function hasCommerceSession() {
  return Boolean(getCommerceAccessToken() || storage()?.getItem(REFRESH_KEY));
}

export function setCommerceSession(session: SessionPayload) {
  const target = storage();
  if (!target) return;
  target.setItem(ACCESS_KEY, session.accessToken);
  target.setItem(REFRESH_KEY, session.refreshToken);
}

export function clearCommerceSession() {
  const target = storage();
  if (!target) return;
  target.removeItem(ACCESS_KEY);
  target.removeItem(REFRESH_KEY);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new CommerceApiError('Pasalho returned an invalid response.', response.status);
  }
}

async function rawRequest(
  path: string,
  init: RequestInit,
  accessToken?: string | null,
) {
  const headers = new Headers(init.headers);
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

  return fetch(path, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

async function refreshSession(): Promise<string | null> {
  const target = storage();
  const refreshToken = target?.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  const response = await rawRequest(
    '/api/commerce/auth/refresh',
    {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    },
    null,
  );
  const body = await readJson(response) as ApiEnvelope<SessionPayload> | ApiErrorBody | null;
  if (!response.ok || !body || body.success !== true) {
    clearCommerceSession();
    return null;
  }
  setCommerceSession(body.data);
  return body.data.accessToken;
}

export async function commerceFetch<T>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean; retryAuth?: boolean } = {},
): Promise<T> {
  const auth = options.auth !== false;
  const token = auth ? getCommerceAccessToken() : null;
  let response = await rawRequest(path, init, token);

  if (auth && response.status === 401 && options.retryAuth !== false) {
    const nextToken = await refreshSession();
    if (nextToken) response = await rawRequest(path, init, nextToken);
  }

  const body = await readJson(response) as ApiEnvelope<T> | ApiErrorBody | null;
  if (!response.ok || !body || body.success !== true) {
    const error = body && 'error' in body ? body.error : undefined;
    if (response.status === 401) clearCommerceSession();
    throw new CommerceApiError(
      error?.message || `Pasalho request failed (HTTP ${response.status}).`,
      response.status,
      error?.code,
      error?.details,
    );
  }

  return body.data;
}
