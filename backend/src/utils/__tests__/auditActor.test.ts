import { bindAuthenticatedAuditActor } from "../auditActor.js";

describe("bindAuthenticatedAuditActor", () => {
  it("replaces client-supplied attribution while preserving target fields", () => {
    const request = {
      user: { id: "authenticated-staff" },
      body: {
        approved_by: "forged-staff",
        acknowledged_by: "forged-staff",
        escalated_by: "forged-staff",
        performed_by: "forged-staff",
        withdrawn_by: "forged-staff",
        assigned_to: "legitimate-target",
        notes: "unchanged",
      },
    } as any;

    bindAuthenticatedAuditActor(request);

    expect(request.body).toEqual({
      approved_by: "authenticated-staff",
      acknowledged_by: "authenticated-staff",
      escalated_by: "authenticated-staff",
      performed_by: "authenticated-staff",
      withdrawn_by: "authenticated-staff",
      assigned_to: "legitimate-target",
      notes: "unchanged",
    });
  });
});
