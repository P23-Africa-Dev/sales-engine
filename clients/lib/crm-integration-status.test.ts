import { describe, expect, it } from "vitest";

export function canSaveLeadsToCrm(status?: {
  can_sync?: boolean;
  block_message?: string | null;
}): { allowed: boolean; message: string } {
  if (status?.can_sync === false) {
    return {
      allowed: false,
      message:
        status.block_message ??
        "CRM sync is unavailable. Sign out and sign back in to link Factory23, or contact your admin.",
    };
  }

  return { allowed: true, message: "" };
}

describe("canSaveLeadsToCrm", () => {
  it("blocks save when CRM is not linked", () => {
    const result = canSaveLeadsToCrm({
      can_sync: false,
      block_message: "Factory23 is not linked for this organization.",
    });

    expect(result.allowed).toBe(false);
    expect(result.message).toContain("not linked");
  });

  it("allows save when integration status is healthy", () => {
    expect(canSaveLeadsToCrm({ can_sync: true }).allowed).toBe(true);
  });
});
