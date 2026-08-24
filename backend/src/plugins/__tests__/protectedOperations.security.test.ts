import { requiresStepUpMfa } from "../protectedOperations.js";

describe("protected operations step-up policy", () => {
  it.each([
    ["POST", "/staff"],
    ["PUT", "/staff/00000000-0000-4000-8000-000000000001"],
    ["POST", "/payments/intents/00000000-0000-4000-8000-000000000001/refund"],
    ["POST", "/payments/reconcile"],
    [
      "POST",
      "/tender-reconciliations/00000000-0000-4000-8000-000000000001/resolve",
    ],
  ])("requires MFA for %s %s", (method, path) => {
    expect(requiresStepUpMfa(method, path)).toBe(true);
  });

  it.each([
    ["GET", "/staff"],
    ["POST", "/pos/sales"],
    ["GET", "/payments/reconcile"],
  ])("does not over-apply MFA to %s %s", (method, path) => {
    expect(requiresStepUpMfa(method, path)).toBe(false);
  });
});
