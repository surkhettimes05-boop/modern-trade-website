import 'server-only';

function insecureInternalApiAllowed(env: NodeJS.ProcessEnv): boolean {
  return env.NEXT_LOCAL_QA === '1' || env.ALLOW_INSECURE_INTERNAL_API === '1';
}

export function configuredServerApiUrl(
  env: NodeJS.ProcessEnv = process.env,
): URL | null {
  const value = env.API_URL || env.NEXT_PUBLIC_API_URL;
  if (!value) return null;

  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('API_URL must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('API_URL must not contain credentials, a query, or a fragment');
  }
  if (
    env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    !insecureInternalApiAllowed(env)
  ) {
    throw new Error('API_URL must use HTTPS in production');
  }
  return url;
}

export function requireServerApiUrl(
  env: NodeJS.ProcessEnv = process.env,
): URL {
  const url = configuredServerApiUrl(env);
  if (!url) throw new Error('API_URL is not configured');
  return url;
}

export function upstreamTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.API_UPSTREAM_TIMEOUT_MS;
  if (!raw) return 8_000;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 30_000) {
    throw new Error(
      'API_UPSTREAM_TIMEOUT_MS must be an integer between 1000 and 30000',
    );
  }
  return value;
}
