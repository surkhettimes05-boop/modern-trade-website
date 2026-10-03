import { randomUUID } from "node:crypto";
import { redisService } from "./redisService.js";
import { logger } from "../utils/logger.js";

export type StoreOrderEventType = "ORDER_CREATED" | "ORDER_STATUS_CHANGED";

export type StoreOrderEvent = {
  id: string;
  type: StoreOrderEventType;
  store_id: string;
  occurred_at: string;
  order: {
    id: string;
    order_number: string;
    status: string;
    total_amount?: number;
    currency?: string;
    delivery_type?: string;
    item_count?: number;
    created_at?: string;
  };
};

type EventInput = Omit<StoreOrderEvent, "id" | "occurred_at">;

class OrderRealtimeService {
  private channel(storeId: string): string {
    const namespace = process.env.REDIS_NAMESPACE || "storesync";
    return `${namespace}:store-orders:${storeId}`;
  }

  async publish(input: EventInput): Promise<void> {
    const event: StoreOrderEvent = {
      ...input,
      id: randomUUID(),
      occurred_at: new Date().toISOString(),
    };
    await redisService.getClient().publish(
      this.channel(input.store_id),
      JSON.stringify(event),
    );
  }

  async safePublish(input: EventInput): Promise<void> {
    try {
      await this.publish(input);
    } catch (error) {
      logger.warn("Store order realtime publish failed", {
        eventType: input.type,
        storeId: input.store_id,
        orderId: input.order.id,
        error: error instanceof Error ? error.message : "ORDER_EVENT_PUBLISH_FAILED",
      });
    }
  }

  async subscribe(
    storeId: string,
    onEvent: (event: StoreOrderEvent) => void,
  ): Promise<() => Promise<void>> {
    const channel = this.channel(storeId);
    const subscriber = redisService.getClient().duplicate();
    const onMessage = (receivedChannel: string, raw: string) => {
      if (receivedChannel !== channel) return;
      try {
        const event = JSON.parse(raw) as StoreOrderEvent;
        if (event.store_id === storeId) onEvent(event);
      } catch (error) {
        logger.warn("Invalid store order realtime payload", {
          storeId,
          error: error instanceof Error ? error.message : "INVALID_ORDER_EVENT",
        });
      }
    };

    subscriber.on("message", onMessage);
    try {
      await subscriber.subscribe(channel);
    } catch (error) {
      subscriber.off("message", onMessage);
      subscriber.disconnect();
      throw error;
    }

    return async () => {
      subscriber.off("message", onMessage);
      try {
        await subscriber.unsubscribe(channel);
      } finally {
        subscriber.disconnect();
      }
    };
  }
}

export const orderRealtimeService = new OrderRealtimeService();
