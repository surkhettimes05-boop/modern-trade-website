import { AsyncLocalStorage } from "node:async_hooks";
import type pg from "pg";

interface RequestContext {
  requestId: string;
  databasePool?: pg.Pool;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext(
  requestId: string,
  callback: () => void,
): void {
  requestContext.run({ requestId }, callback);
}

export function enterRequestContext(requestId: string): void {
  requestContext.enterWith({ requestId });
}

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

export function currentRequestDatabasePool(): pg.Pool | undefined {
  return requestContext.getStore()?.databasePool;
}

export function setCurrentRequestDatabasePool(databasePool: pg.Pool): void {
  const context = requestContext.getStore();
  if (!context) {
    throw new Error("A request-scoped database pool requires request context");
  }
  context.databasePool = databasePool;
}

export async function closeCurrentRequestDatabasePool(): Promise<void> {
  const context = requestContext.getStore();
  const databasePool = context?.databasePool;
  if (!databasePool) return;
  context.databasePool = undefined;
  await databasePool.end();
}
