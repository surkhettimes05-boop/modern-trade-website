import { customerCsrfValid } from "../customerAuthentication.js";

describe("customer CSRF protection", () => {
  const request = (cookie?: string, header?: string) =>
    ({
      cookies: cookie ? { customer_csrf: cookie } : {},
      headers: header ? { "x-csrf-token": header } : {},
    }) as any;

  it("accepts an exact cookie/header match", () => {
    expect(customerCsrfValid(request("token", "token"))).toBe(true);
  });

  it.each([
    ["missing cookie", request(undefined, "token")],
    ["missing header", request("token")],
    ["mismatched values", request("token", "other")],
  ])("rejects %s", (_label, value) => {
    expect(customerCsrfValid(value)).toBe(false);
  });
});
