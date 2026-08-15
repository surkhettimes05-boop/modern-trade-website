import { csrfMatches, isSafeMethod } from "../csrf.js";

describe("staff CSRF contract", () => {
  it("allows safe methods", () => {
    expect(isSafeMethod("GET")).toBe(true);
    expect(isSafeMethod("POST")).toBe(false);
  });

  it("requires a matching cookie and header for mutations", () => {
    expect(
      csrfMatches({
        method: "POST",
        cookies: { csrf_token: "abc" },
        headers: { "x-csrf-token": "abc" },
      } as any),
    ).toBe(true);
    expect(
      csrfMatches({
        method: "POST",
        cookies: { csrf_token: "abc" },
        headers: { "x-csrf-token": "wrong" },
      } as any),
    ).toBe(false);
    expect(
      csrfMatches({ method: "GET", cookies: {}, headers: {} } as any),
    ).toBe(true);
  });
});
