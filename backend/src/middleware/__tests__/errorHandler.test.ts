import Fastify from "fastify";
import { errorHandler } from "../errorHandler.js";

describe("error responses and request IDs", () => {
  it("returns a redacted 500 response with the correlation request ID", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const app = Fastify({ requestIdHeader: "x-request-id" });
    app.setErrorHandler(errorHandler);
    app.get("/failure", async () => {
      throw new Error("customer demo@example.com token secret-value");
    });

    const response = await app.inject({
      method: "GET",
      url: "/failure",
      headers: { "x-request-id": "release-test-request-1" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      requestId: "release-test-request-1",
    });
    expect(response.payload).not.toContain("demo@example.com");
    expect(consoleSpy.mock.calls.flat().join(" ")).not.toContain("demo@example.com");
    consoleSpy.mockRestore();
    await app.close();
  });
});
