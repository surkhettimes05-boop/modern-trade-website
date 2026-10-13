import { createHmac } from "node:crypto";
import { rateLimitClientKey } from "../proxyClientIdentity.js";
const secret = "test-proxy-secret-unique-32-bytes-minimum";
const original = process.env.PROXY_AUTH_SECRET;
beforeEach(() => {
  process.env.PROXY_AUTH_SECRET = secret;
});
afterAll(() => {
  if (original === undefined) delete process.env.PROXY_AUTH_SECRET;
  else process.env.PROXY_AUTH_SECRET = original;
});
function request(age = 0) {
  const ip = "203.0.113.5";
  const timestamp = String(Date.now() - age);
  return {
    ip: "192.0.2.2",
    headers: {
      "x-pasalho-client-ip": ip,
      "x-pasalho-client-time": timestamp,
      "x-pasalho-client-signature": createHmac("sha256", secret)
        .update(`${timestamp}\n${ip}`)
        .digest("hex"),
    },
  };
}
test("valid signed edge identity selects the client bucket", () =>
  expect(rateLimitClientKey(request())).toBe("203.0.113.5"));
test("unsigned caller uses backend IP", () =>
  expect(
    rateLimitClientKey({
      ip: "192.0.2.2",
      headers: { "x-forwarded-for": "203.0.113.9" },
    }),
  ).toBe("192.0.2.2"));
test("expired signed identity cannot select an arbitrary bucket", () =>
  expect(rateLimitClientKey(request(120000))).toBe("192.0.2.2"));
test("forged identity cannot select an arbitrary bucket", () => {
  const value = request();
  value.headers["x-pasalho-client-ip"] = "203.0.113.99";
  expect(rateLimitClientKey(value)).toBe("192.0.2.2");
});
