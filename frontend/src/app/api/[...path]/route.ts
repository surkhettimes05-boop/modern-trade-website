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

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: pathParts } = await context.params;
  const path = pathParts.map(encodeURIComponent).join("/");
  const isCommerce = path === "commerce" || path.startsWith("commerce/");

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
    const accessToken = request.cookies.get("pasalho_customer_access")?.value;
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
        {
          error:
            "Backend returned a non-JSON response; check the API configuration",
        },
        { status: 502 },
      );
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
