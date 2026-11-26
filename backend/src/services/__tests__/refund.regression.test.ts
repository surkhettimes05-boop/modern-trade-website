import { query } from "../../database/connection.js";
import { paymentProviderService } from "../paymentProviderService.js";
import { RefundService } from "../refundService.js";

jest.mock("../../database/connection.js", () => ({...jest.requireActual("../../database/connection.js"), query: jest.fn()}));
jest.mock("../paymentProviderService.js", () => ({paymentProviderService:{createRefund:jest.fn(),getRefundStatus:jest.fn()}}));

const db = query as jest.Mock;
const provider = paymentProviderService.createRefund as jest.Mock;
const status = paymentProviderService.getRefundStatus as jest.Mock;
describe("refund service financial boundaries (mocked persistence and provider)", () => {
  const service = new RefundService();
  const input = {payment_intent_id:"fixture-payment",amount:100,reason:"fixture"};
  beforeEach(() => jest.resetAllMocks());
  it("rejects missing payments without writes or provider calls", async () => {
    db.mockResolvedValueOnce({rows:[]});
    await expect(service.createRefund(input)).rejects.toThrow("Payment intent not found");
    expect(db).toHaveBeenCalledTimes(1);
    expect(provider).not.toHaveBeenCalled();
  });
  it.each(["PENDING","FAILED","CANCELLED"])("rejects %s payments", async state => {
    db.mockResolvedValueOnce({rows:[{status:state}]});
    await expect(service.createRefund(input)).rejects.toThrow("not completed");
    expect(db).toHaveBeenCalledTimes(1);
    expect(provider).not.toHaveBeenCalled();
  });
  it("records provider failure rather than reporting a completed refund", async () => {
    db.mockResolvedValueOnce({rows:[{status:"COMPLETED",provider:"fixture",provider_intent_id:"provider-payment"}]})
      .mockResolvedValueOnce({rows:[{status:"PENDING"}]}).mockResolvedValueOnce({rows:[]});
    provider.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(service.createRefund(input)).rejects.toThrow("provider unavailable");
    expect(db.mock.calls[2][0]).toContain("status = 'FAILED'");
    expect(provider).toHaveBeenCalledWith("fixture",{payment_intent_id:"provider-payment",amount:100,reason:"fixture"});
  });
  it("does not query provider for an unknown or unlinked refund", async () => {
    db.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{}]});
    await expect(service.syncRefundStatus("unknown")).rejects.toThrow("Refund not found");
    await expect(service.syncRefundStatus("unlinked")).rejects.toThrow("no provider refund ID");
    expect(status).not.toHaveBeenCalled();
  });
  it.each([["SUCCESS","COMPLETED"],["FAILED","FAILED"],["PENDING","PROCESSING"],["UNKNOWN","PROCESSING"]])("maps provider %s to %s", async (external,internal) => {
    db.mockResolvedValueOnce({rows:[{provider:"fixture",provider_refund_id:"external"}]})
      .mockResolvedValueOnce({rows:[{status:internal}]});
    status.mockResolvedValueOnce({status:external});
    expect(await service.syncRefundStatus("fixture")).toEqual({status:internal});
    expect(db.mock.calls[1][1][0]).toBe(internal);
  });
});
