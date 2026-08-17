import { FastifyReply, FastifyRequest } from "fastify";
import { SessionService } from "../services/sessionService.js";

export const CUSTOMER_SESSION_COOKIE = "customer_session";
export const CUSTOMER_CSRF_COOKIE = "customer_csrf";
const sessions = new SessionService();

export async function authenticateCustomer(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies?.[CUSTOMER_SESSION_COOKIE];
  if (!token) return reply.status(401).send({ error: "Customer login required" });
  const session = await sessions.validateSession(token);
  if (!session) return reply.status(401).send({ error: "Customer session expired" });
  (request as FastifyRequest & { customerId?: string }).customerId = session.customer_id;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !customerCsrfValid(request)) {
    return reply.status(403).send({ error: "CSRF validation failed" });
  }
}

export function customerId(request: FastifyRequest): string {
  const id = (request as FastifyRequest & { customerId?: string }).customerId;
  if (!id) throw new Error("Customer authentication required");
  return id;
}

export function customerCsrfValid(request: FastifyRequest): boolean {
  const cookie = request.cookies?.[CUSTOMER_CSRF_COOKIE];
  const header = request.headers["x-csrf-token"];
  return Boolean(cookie && typeof header === "string" && cookie === header);
}
