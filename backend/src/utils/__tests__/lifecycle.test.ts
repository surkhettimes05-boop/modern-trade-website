import {
  createShutdownHandler,
  isShuttingDown,
  resetShutdownStateForTests,
} from "../lifecycle.js";

describe("graceful shutdown lifecycle", () => {
  beforeEach(() => resetShutdownStateForTests());

  it("marks readiness unavailable and closes exactly once", async () => {
    let finishClose: (() => void) | undefined;
    const close = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishClose = resolve;
        }),
    );
    const forceExit = jest.fn();
    const shutdown = createShutdownHandler({
      fastify: { close },
      timeoutMs: 1_000,
      forceExit,
    });

    const first = shutdown("SIGTERM");
    const second = shutdown("SIGINT");
    expect(isShuttingDown()).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);

    finishClose?.();
    await Promise.all([first, second]);
    expect(forceExit).not.toHaveBeenCalled();
  });
});
