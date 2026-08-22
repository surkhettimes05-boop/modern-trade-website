import { hashSessionToken } from "../sessionToken.js";

describe("hashSessionToken", () => {
  it("produces a deterministic one-way database lookup value", () => {
    const raw = "f45ac75c-9a27-4a0c-8638-76b44cc0e663";
    const digest = hashSessionToken(raw);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(raw);
    expect(hashSessionToken(raw)).toBe(digest);
  });
});
