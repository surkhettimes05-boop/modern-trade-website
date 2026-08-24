import Fastify from "fastify";
import { errorHandler } from "../../middleware/errorHandler.js";
import { healthRoutes } from "../health.js";
import { publicRoutes } from "../public.js";

export async function build() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);

  await app.register(healthRoutes, { prefix: "/api/health" });
  await app.register(publicRoutes, { prefix: "/api/public" });

  return app;
}
