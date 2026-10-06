import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { FastifyRequest } from "fastify";

// Only the Vercel server knows this secret; raw forwarding headers are not trusted.
export function rateLimitClientKey(
  request: Pick<FastifyRequest, "headers" | "ip">,
): string {
  const ip = request.headers["x-pasalho-client-ip"];
  const timestamp = request.headers["x-pasalho-client-time"];
  const signature = request.headers["x-pasalho-client-signature"];
  const secret = process.env.PROXY_AUTH_SECRET;
  if (
    !secret ||
    typeof ip !== "string" ||
    !isIP(ip) ||
    typeof timestamp !== "string" ||
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 60_000 ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return request.ip;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}\n${ip}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"))
    ? ip
    : request.ip;
}
