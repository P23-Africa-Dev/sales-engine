import { describe, expect, it } from "vitest";

import {
  isGenericLeadRequest,
  looksLikeLeadGeneration,
  shouldShowIcpConfirmCard,
  stripEntityModeCue,
  stripProspectCountInstruction,
} from "./is-generic-lead-request";

describe("isGenericLeadRequest", () => {
  it("treats vague generate asks as generic", () => {
    expect(isGenericLeadRequest("Generate leads relevant to me")).toBe(true);
    expect(
      isGenericLeadRequest(
        "Generate leads relevant to my ICP (Find 100 prospects unless a different number is specified.)"
      )
    ).toBe(true);
    expect(isGenericLeadRequest("generate new prospects")).toBe(true);
    expect(isGenericLeadRequest("Generate me leads")).toBe(true);
    expect(isGenericLeadRequest("get me prospects")).toBe(true);
    expect(isGenericLeadRequest("Generate me 10 prospect that can further my need")).toBe(true);
    expect(isGenericLeadRequest("Generate me 10 prospects that can further my need")).toBe(true);
    expect(isGenericLeadRequest("give me prospects (companies only)")).toBe(true);
    expect(isGenericLeadRequest("give me prospects (people only)")).toBe(true);
    expect(isGenericLeadRequest("20 leads")).toBe(true);
  });

  it("treats niche / factual asks as specific", () => {
    expect(isGenericLeadRequest("I need leads of the top richest people in the world")).toBe(false);
    expect(isGenericLeadRequest("FMCG distributors in Lagos")).toBe(false);
    expect(isGenericLeadRequest("earthmoving dealers in Nigeria")).toBe(false);
  });

  it("strips count wrappers and entity cues before classifying", () => {
    expect(stripProspectCountInstruction("Find 20 leads. give me prospects")).toContain("give me prospects");
    expect(stripEntityModeCue("give me prospects (companies only)")).toBe("give me prospects");
  });
});

describe("shouldShowIcpConfirmCard", () => {
  it("shows confirm for vague generate_leads", () => {
    expect(shouldShowIcpConfirmCard("generate_leads", "Generate me leads")).toBe(true);
    expect(shouldShowIcpConfirmCard("generate_leads", "get me prospects")).toBe(true);
  });

  it("skips confirm for specific generate_leads", () => {
    expect(shouldShowIcpConfirmCard("generate_leads", "earthmoving dealers in Nigeria")).toBe(false);
    expect(shouldShowIcpConfirmCard("generate_leads", "FMCG distributors in Lagos")).toBe(false);
  });

  it("shows confirm for freeform vague lead-like asks", () => {
    expect(looksLikeLeadGeneration("Generate me leads")).toBe(true);
    expect(shouldShowIcpConfirmCard("freeform", "Generate me leads")).toBe(true);
    expect(shouldShowIcpConfirmCard("freeform", "give me prospects")).toBe(true);
  });

  it("skips confirm for freeform specific or non-lead asks", () => {
    expect(shouldShowIcpConfirmCard("freeform", "FMCG distributors in Lagos")).toBe(false);
    expect(shouldShowIcpConfirmCard("freeform", "what is my usage")).toBe(false);
  });
});
