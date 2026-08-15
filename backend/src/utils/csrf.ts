import { FastifyRequest } from "fastify";

export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

export function isSafeMethod(method: string): boolean {
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function csrfMatches(request: FastifyRequest): boolean {
  if (isSafeMethod(request.method)) return true;
  const cookieValue = (request as any).cookies?.[CSRF_COOKIE];
  const headerValue = request.headers[CSRF_HEADER];
  return (
    typeof cookieValue === "string" &&
    typeof headerValue === "string" &&
    cookieValue.length > 0 &&
    cookieValue === headerValue
  );
}
