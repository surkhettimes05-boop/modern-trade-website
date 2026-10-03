import { FastifyInstance } from "fastify";
import { z } from "zod";
import { orderRealtimeService } from "../services/orderRealtimeService.js";

export async function storeOrderRoutes(fastify: FastifyInstance) {
  fastify.get("/store-orders/stream", async (request, reply) => {
    const { store_id } = z
      .object({ store_id: z.string().uuid() })
      .strict()
      .parse(request.query);

    reply.hijack();
    const response = reply.raw;
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    let closed = false;
    let unsubscribe: (() => Promise<void>) | undefined;
    const writeEvent = (event: string, data: unknown) => {
      if (closed || response.destroyed) return;
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      unsubscribe = await orderRealtimeService.subscribe(store_id, (event) => {
        writeEvent("order", event);
      });
      writeEvent("ready", { store_id });
    } catch (error) {
      request.log.error({ error, store_id }, "Store order stream subscription failed");
      writeEvent("error", { code: "ORDER_STREAM_UNAVAILABLE" });
      response.end();
      return;
    }

    const heartbeat = setInterval(() => {
      if (!closed && !response.destroyed) response.write(": heartbeat\n\n");
    }, 15_000);
    heartbeat.unref();

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      if (unsubscribe) void unsubscribe();
    };

    response.once("close", cleanup);
    request.raw.socket?.once("close", cleanup);
  });
}
