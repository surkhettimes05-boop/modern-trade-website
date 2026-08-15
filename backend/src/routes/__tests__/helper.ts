import Fastify from "fastify";
import { healthRoutes } from "../health.js";
import { publicRoutes } from "../public.js";

export async function build() {
  const app = Fastify();

  await app.register(healthRoutes, { prefix: "/api/health" });
  await app.register(publicRoutes, { prefix: "/api/public" });

  return app;
}
