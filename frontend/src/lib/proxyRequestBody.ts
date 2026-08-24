import type { NextRequest } from 'next/server';

export const MAX_PROXY_BODY_BYTES = 1024 * 1024;

export class ProxyPayloadTooLargeError extends Error {}

export async function readBoundedProxyBody(
  request: NextRequest | Request,
  maxBytes = MAX_PROXY_BODY_BYTES,
): Promise<ArrayBuffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const declaredLength = request.headers.get('content-length');
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new ProxyPayloadTooLargeError('Invalid request length');
    }
    if (parsedLength > maxBytes) {
      throw new ProxyPayloadTooLargeError('Request body is too large');
    }
  }

  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ProxyPayloadTooLargeError('Request body is too large');
    }
    chunks.push(value);
  }

  const bodyBuffer = new ArrayBuffer(total);
  const body = new Uint8Array(bodyBuffer);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bodyBuffer;
}
