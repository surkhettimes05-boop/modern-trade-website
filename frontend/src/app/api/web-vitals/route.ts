import { NextResponse } from 'next/server';
import { ProxyPayloadTooLargeError, readBoundedProxyBody } from '@/lib/proxyRequestBody';

const allowedMetrics = new Set(['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB']);
const allowedRatings = new Set(['good', 'needs-improvement', 'poor']);
const MAX_WEB_VITALS_BODY_BYTES = 16 * 1024;

function safePath(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 300) return undefined;
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

export async function POST(request: Request) {
  try {
    const bytes = await readBoundedProxyBody(request, MAX_WEB_VITALS_BODY_BYTES);
    const body = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    const name = String(body.name);
    const value = Number(body.value);
    const delta = Number(body.delta);
    if (
      !allowedMetrics.has(name) ||
      !Number.isFinite(value) ||
      Math.abs(value) > 1_000_000_000 ||
      !Number.isFinite(delta) ||
      Math.abs(delta) > 1_000_000_000 ||
      typeof body.id !== 'string' ||
      body.id.length < 1 ||
      body.id.length > 100 ||
      !allowedRatings.has(String(body.rating))
    ) {
      return NextResponse.json({ error: 'Invalid metric' }, { status: 400 });
    }
    console.info(JSON.stringify({
      event: 'web_vital',
      id: body.id,
      name,
      value,
      delta,
      rating: body.rating,
      navigationType:
        typeof body.navigationType === 'string'
          ? body.navigationType.slice(0, 50)
          : undefined,
      path: safePath(body.path),
    }));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ProxyPayloadTooLargeError) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
