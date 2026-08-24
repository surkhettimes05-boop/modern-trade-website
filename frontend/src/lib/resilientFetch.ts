export interface ResilientFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

export class RequestTimeoutError extends Error {
  constructor(message = "The request timed out") {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

function configuredTimeoutMs(): number {
  const raw = process.env.NEXT_PUBLIC_REQUEST_TIMEOUT_MS;
  if (!raw) return 10_000;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 60_000) {
    throw new Error(
      "NEXT_PUBLIC_REQUEST_TIMEOUT_MS must be an integer between 1000 and 60000",
    );
  }
  return value;
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The request was aborted", "AbortError");
}

async function backoff(attempt: number, signal?: AbortSignal): Promise<void> {
  const delayMs = 200 * 2 ** attempt + Math.floor(Math.random() * 100);
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function resilientFetch(
  input: RequestInfo | URL,
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = configuredTimeoutMs(),
    retries: configuredRetries,
    signal,
    ...requestOptions
  } = options;
  const callerSignal = signal ?? undefined;
  const method = (
    requestOptions.method || (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const retries = method === "GET" ? (configuredRetries ?? 2) : 0;
  const deadline = Date.now() + timeoutMs;

  for (let attempt = 0; ; attempt += 1) {
    if (callerSignal?.aborted) throw abortReason(callerSignal);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new RequestTimeoutError();
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, remainingMs);
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const response = await fetch(input, {
        ...requestOptions,
        signal: controller.signal,
      });
      if (
        attempt < retries &&
        RETRYABLE_STATUS.has(response.status)
      ) {
        await response.body?.cancel();
        await backoff(attempt, callerSignal);
        continue;
      }
      return response;
    } catch (error) {
      if (callerSignal?.aborted) throw abortReason(callerSignal);
      if (timedOut) throw new RequestTimeoutError();
      if (attempt < retries) {
        await backoff(attempt, callerSignal);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }
}
