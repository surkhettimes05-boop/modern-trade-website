import { NextRequest, NextResponse } from "next/server";
import {
  requirePasalhoApiUrl,
  requireServerApiUrl,
  upstreamTimeoutMs,
} from "@/lib/serverApiUrl";
import {
  ProxyPayloadTooLargeError,
  readBoundedProxyBody,
} from "@/lib/proxyRequestBody";
import {
  proxyRequestHeaders,
  proxyResponseHeaders,
} from "@/lib/proxyHeaders";

const ACCESS_COOKIE = "pasalho_customer_access";
const REFRESH_COOKIE = "pasalho_customer_refresh";

function unavailableResponse(path: string, method: string) {
  if (method === "GET" && /^public\/(products|categories|stores|offers)(\/|$)/.test(path)) {
    return NextResponse.json([]);
  }

  if (/^(commerce|auth|customer|ledger|consent)(\/|$)/.test(path)) {
    return NextResponse.json(
      { error: "Customer commerce is temporarily unavailable" },
      { status: path.startsWith("commerce") ? 503 : 401 },
    );
  }

  return NextResponse.json(
    { error: "Backend service is temporarily unavailable" },
    { status: 503 },
  );
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function clearCustomerCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", sessionCookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, "", sessionCookieOptions(0));
}

function authData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.success === true &&
    record.data &&
    typeof record.data === "object"
  ) {
    return record.data as Record<string, unknown>;
  }
  return record;
}

function sanitizedAuthPayload(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const data = authData(value);
  if (!data) return value;

  const safeData = { ...data };
  delete safeData.accessToken;
  delete safeData.refreshToken;

  if (
    record.success === true &&
    record.data &&
    typeof record.data === "object"
  ) {
    return { ...record, data: safeData };
  }
  return safeData;
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: pathParts } = await context.params;
  const path = pathParts.map(encodeURIComponent).join("/");
  const isCommerce = path === "commerce" || path.startsWith("commerce/");
  const isVerify = path === "commerce/auth/verify-otp";
  const isRefresh = path === "commerce/auth/refresh";
  const isLogout = path === "commerce/auth/logout";

  let target: URL;
  try {
    target = isCommerce
      ? new URL(`/api/v1/${path}`, requirePasalhoApiUrl())
      : new URL(`/api/${path}`, requireServerApiUrl());
    target.search = request.nextUrl.search;
  } catch {
    return NextResponse.json(
      {
        error: isCommerce
          ? "Pasalho commerce backend is not configured"
          : "Backend service is not configured",
      },
      { status: 500 },
    );
  }

  const requestHeaders = proxyRequestHeaders(request.headers);
  if (isCommerce) {
    requestHeaders.delete("cookie");
    const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
    if (accessToken) {
      requestHeaders.set("authorization", `Bearer ${accessToken}`);
    }
  }

  let requestBody: ArrayBuffer | undefined;
  try {
    requestBody = await readBoundedProxyBody(request);
  } catch (error) {
    if (error instanceof ProxyPayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json(
      { error: "Request body could not be read" },
      { status: 400 },
    );
  }

  if (isRefresh) {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      const response = NextResponse.json(
        { error: "Customer authentication required" },
        { status: 401 },
      );
      clearCustomerCookies(response);
      return response;
    }
    requestHeaders.set("content-type", "application/json");
    requestBody = new TextEncoder().encode(
      JSON.stringify({ refreshToken }),
    ).buffer as ArrayBuffer;
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: requestHeaders,
      body: requestBody,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(upstreamTimeoutMs()),
      ]),
    });

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Backend returned a non-JSON response" },
        { status: 502 },
      );
    }

    if (isVerify || isRefresh) {
      const payload = (await upstream.json()) as unknown;
      const response = NextResponse.json(sanitizedAuthPayload(payload), {
        status: upstream.status,
      });
      const data = authData(payload);
      const accessToken =
        data && typeof data.accessToken === "string" ? data.accessToken : null;
      const refreshToken =
        data && typeof data.refreshToken === "string" ? data.refreshToken : null;
      const expiresIn =
        data && typeof data.expiresIn === "number" ? data.expiresIn : 900;

      if (upstream.ok && accessToken && refreshToken) {
        response.cookies.set(
          ACCESS_COOKIE,
          accessToken,
          sessionCookieOptions(expiresIn),
        );
        response.cookies.set(
          REFRESH_COOKIE,
          refreshToken,
          sessionCookieOptions(30 * 24 * 60 * 60),
        );
      } else if (isRefresh && upstream.status === 401) {
        clearCustomerCookies(response);
      }
      return response;
    }

    const responseHeaders = proxyResponseHeaders(upstream.headers);
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });

    if (!isCommerce) {
      for (const cookie of upstream.headers.getSetCookie()) {
        response.headers.append("set-cookie", cookie);
      }
    }

    if (isLogout) {
      clearCustomerCookies(response);
    }

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Backend service timed out" },
        { status: 504 },
      );
    }
    return unavailableResponse(path, request.method);
  }
}

export const dynamic = "force-dynamic";
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
