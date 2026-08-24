import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  requestId: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext(
  requestId: string,
  callback: () => void,
): void {
  requestContext.run({ requestId }, callback);
}

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
