import { NextResponse } from 'next/server';

const allowedMetrics = new Set(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']);

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!allowedMetrics.has(String(body.name)) || !Number.isFinite(Number(body.value))) {
      return NextResponse.json({ error: 'Invalid metric' }, { status: 400 });
    }
    console.info(JSON.stringify({ event: 'web_vital', ...body }));
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
