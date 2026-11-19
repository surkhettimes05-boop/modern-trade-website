import { creatorReferralLink } from "../creatorReferralLink.js";

describe("creator referral links", () => {
  it("generates a first-party customer website URL", () => {
    expect(creatorReferralLink("creator-one", "https://pasalho.example")).toEqual({
      path: "/r/creator-one",
      url: "https://pasalho.example/r/creator-one",
    });
  });

  it("does not fall back to the separate API domain when the web origin is missing", () => {
    expect(creatorReferralLink("creator-one", "")).toEqual({
      path: "/r/creator-one",
      url: null,
    });
  });

  it("URL-encodes the slug", () => {
    expect(creatorReferralLink("a/b", "https://pasalho.example").path).toBe("/r/a%2Fb");
  });
});
