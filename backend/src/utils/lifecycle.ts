import { logger } from "./logger.js";

let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function markShuttingDown(): void {
  shuttingDown = true;
}

export function resetShutdownStateForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Shutdown state can only be reset in tests");
  }
  shuttingDown = false;
}

export function createShutdownHandler(input: {
  fastify: { close: () => Promise<unknown> };
  timeoutMs: number;
  forceExit?: (code: number) => void;
}): (signal: NodeJS.Signals) => Promise<void> {
  let shutdownPromise: Promise<void> | null = null;
  const forceExit = input.forceExit || ((code: number) => process.exit(code));

  return (signal: NodeJS.Signals): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    markShuttingDown();
    logger.info("Graceful shutdown started", { signal });

    shutdownPromise = new Promise<void>((resolve) => {
      const deadline = setTimeout(() => {
        logger.error("Graceful shutdown deadline exceeded", {
          signal,
          timeoutMs: input.timeoutMs,
        });
        forceExit(1);
        resolve();
      }, input.timeoutMs);
      deadline.unref();

      void input.fastify
        .close()
        .then(() => {
          clearTimeout(deadline);
          logger.info("Graceful shutdown completed", { signal });
          resolve();
        })
        .catch((error: unknown) => {
          clearTimeout(deadline);
          logger.error("Graceful shutdown failed", {
            signal,
            error:
              error instanceof Error ? error.message : "UNKNOWN_SHUTDOWN_ERROR",
          });
          forceExit(1);
          resolve();
        });
    });

    return shutdownPromise;
  };
}
