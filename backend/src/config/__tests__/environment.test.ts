import {
  getDatabaseUrl,
  validateProductionEnvironment,
} from "../environment.js";

describe("environment safety", () => {
  it("requires an explicit test database URL", () => {
    expect(() => getDatabaseUrl({ NODE_ENV: "test" })).toThrow(
      "TEST_DATABASE_URL is required",
    );
  });

  it.each([
    "postgresql://user:pass@prod.example.com/storesync_test",
    "postgresql://user:pass@localhost/storesync",
  ])("rejects unsafe test database URL %s", (TEST_DATABASE_URL) => {
    expect(() =>
      getDatabaseUrl({ NODE_ENV: "test", TEST_DATABASE_URL }),
    ).toThrow("Refusing unsafe test database URL");
  });

  it("requires stable production encryption and signing keys", () => {
    expect(() =>
      validateProductionEnvironment({ NODE_ENV: "production" }),
    ).toThrow("Missing required production configuration");
  });
});
