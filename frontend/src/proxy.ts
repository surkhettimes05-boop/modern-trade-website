import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Optimistic defense-in-depth check for staff UI routes. Cookie presence is
 * not proof of authentication: backend endpoints still verify the signed JWT,
 * capabilities, store scope, CSRF token, and MFA state on every request.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("ops_session")) return NextResponse.next();

  const login = new URL("/staff-login", request.url);
  login.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin/:path*", "/operations/:path*"],
};
