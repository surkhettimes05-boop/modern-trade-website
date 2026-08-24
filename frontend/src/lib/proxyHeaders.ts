const REQUEST_HEADER_ALLOWLIST = [
  "accept",
  "authorization",
  "content-type",
  "cookie",
  "idempotency-key",
  "origin",
  "user-agent",
  "x-csrf-token",
  "x-request-id",
] as const;

const RESPONSE_HEADER_ALLOWLIST = [
  "cache-control",
  "content-language",
  "content-type",
  "etag",
  "last-modified",
  "retry-after",
  "vary",
] as const;

export function proxyRequestHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of REQUEST_HEADER_ALLOWLIST) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

export function proxyResponseHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of RESPONSE_HEADER_ALLOWLIST) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}
