import { NextRequest, NextResponse } from "next/server";
import { requireServerApiUrl, upstreamTimeoutMs } from "@/lib/serverApiUrl";
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

  if (/^(commerce\/auth|commerce\/me|commerce\/orders)(\/|$)/.test(path)) {
    return NextResponse.json(
      { success: false, error: { code: "BACKEND_UNAVAILABLE", message: "Pasalho commerce is temporarily unavailable.", details: {} } },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { success: false, error: { code: "BACKEND_UNAVAILABLE", message: "Backend service is temporarily unavailable.", details: {} } },
    { status: 503 },
  );
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: pathParts } = await context.params;
  const path = pathParts.map(encodeURIComponent).join("/");
  let target: URL;
  try {
    target = new URL(`/api/v1/${path}`, requireServerApiUrl());
    target.search = request.nextUrl.search;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "BACKEND_NOT_CONFIGURED", message: "Backend service is not configured.", details: {} } },
      { status: 500 },
    );
  }

  const requestHeaders = proxyRequestHeaders(request.headers);

  let requestBody: ArrayBuffer | undefined;
  try {
    requestBody = await readBoundedProxyBody(request);
  } catch (error) {
    if (error instanceof ProxyPayloadTooLargeError) {
      return NextResponse.json(
        { success: false, error: { code: "PAYLOAD_TOO_LARGE", message: error.message, details: {} } },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST_BODY", message: "Request body could not be read.", details: {} } },
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
        { success: false, error: { code: "INVALID_UPSTREAM_RESPONSE", message: "Backend returned a non-JSON response.", details: {} } },
        { status: 502 },
      );
    }

    const responseHeaders = proxyResponseHeaders(upstream.headers);
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });

    for (const cookie of upstream.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json(
        { success: false, error: { code: "BACKEND_TIMEOUT", message: "Backend service timed out.", details: {} } },
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
