import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isBrowseOnly, isClosedCustomerRoute, shouldBlockBrowseOnlyMutation } from './lib/publicLaunch';

export function proxy(request: NextRequest) {
  if (!isBrowseOnly()) return NextResponse.next();

  if (shouldBlockBrowseOnlyMutation(request.nextUrl.pathname, request.method)) {
    return NextResponse.json({
      code: 'CATALOG_ONLY',
      error: 'PASALHO is currently browse-only; orders and registration are closed',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  if (isClosedCustomerRoute(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/launch-info', request.url), 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2)$).*)'],
};
