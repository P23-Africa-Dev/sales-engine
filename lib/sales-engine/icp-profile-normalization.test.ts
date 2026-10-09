import { describe, expect, it } from "vitest";
import { normalizeIcpConfig, type IcpConfig, type IcpProfile } from "../../components/sales-engine/icp-builder-modal";
import { mapApiIcpProfile } from "../api/sales-engine";

describe("ICP profile and config normalization", () => {
  it("normalizes empty or null customPrompt to empty string in normalizeIcpConfig", () => {
    const raw: Partial<IcpConfig> = {
      profileName: "Custom ICP",
      customPrompt: null,
      industries: undefined,
    };
    const normalized = normalizeIcpConfig(raw);
    expect(normalized.customPrompt).toBe("");
    expect(normalized.customPrompt?.trim()).toBe("");
    expect(Array.isArray(normalized.industries)).toBe(true);
  });

  it("normalizes undefined config to default values", () => {
    const normalized = normalizeIcpConfig(null);
    expect(normalized.customPrompt).toBe("");
    expect(normalized.profileName).toBe("");
    expect(normalized.industries.length).toBeGreaterThan(0);
  });

  it("sanitizes null customPrompt from backend response in mapApiIcpProfile", () => {
    const apiProfile = {
      id: "icp-123",
      name: "FMCG Tech",
      description: "Sample",
      isActive: true,
      leadCount: 5,
      lastUpdated: new Date().toISOString(),
      config: {
        profileName: "FMCG Tech",
        description: "Sample",
        customPrompt: null,
        industries: null as unknown as string[],
        companySizes: null as unknown as string[],
        revenueRanges: null as unknown as string[],
        territories: null as unknown as string[],
        decisionMakers: null as unknown as string[],
        minMatchScore: 60,
        autoSyncCrm: true,
        enrichContactDetails: true,
      } as unknown as IcpProfile["config"],
    };

    const mapped = mapApiIcpProfile(apiProfile);
    expect(mapped.config.customPrompt).toBe("");
    expect(mapped.config.customPrompt?.trim()).toBe("");
    expect(Array.isArray(mapped.config.industries)).toBe(true);
    expect(Array.isArray(mapped.config.companySizes)).toBe(true);
    expect(Array.isArray(mapped.config.revenueRanges)).toBe(true);
    expect(Array.isArray(mapped.config.territories)).toBe(true);
    expect(Array.isArray(mapped.config.decisionMakers)).toBe(true);
  });

  it("defaults description and customPrompt to empty strings when missing", () => {
    const normalized = normalizeIcpConfig({});
    expect(normalized.description).toBe("");
    expect(normalized.customPrompt).toBe("");
  });
});

