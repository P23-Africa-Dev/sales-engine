import { describe, expect, it } from "vitest";
import {
  composeIcpSearchBrief,
  composeIcpSearchQueries,
  composeSearchGeoCaption,
  clampToMaxWords,
  countWords,
  wordsRemaining,
  ICP_BRIEF_MAX_WORDS,
  splitBriefIntoSearchQueries,
  entityModeLabel,
  isInsufficientIcpSearchBrief,
  scoreIcpStrength,
  withEntityModeCue,
  withProspectCountCue,
  suggestIcpSearchBriefLocal,
  expandKeywordPool,
  nextVisibleKeywords,
} from "./icp-search-brief";

describe("icp-search-brief", () => {
  it("composes custom prompt first", () => {
    expect(
      composeIcpSearchBrief({
        customPrompt: "earthmoving plant hire dealers",
        description: "fallback",
        industries: ["Manufacturing"],
      })
    ).toBe("earthmoving plant hire dealers");
  });

  it("scores a concrete brief with territory as strong", () => {
    const strong = scoreIcpStrength({
      profileName: "Cold-chain 3PLs",
      description: "Operators who store and move temperature-sensitive freight.",
      customPrompt: "cold-chain 3PL operators hiring warehouse leads",
      industries: ["Logistics & Fleet"],
      territories: ["Lagos, Nigeria"],
    });
    expect(strong.band).toBe("strong");
    expect(strong.score).toBeGreaterThanOrEqual(75);

    const vague = scoreIcpStrength({
      profileName: "Buyers",
      description: "Companies",
      customPrompt: "companies",
      industries: ["FMCG & Retail"],
      territories: ["Nigeria"],
    });
    expect(vague.band).toBe("weak");
    expect(vague.hint.toLowerCase()).toContain("vague");

    const noCountry = scoreIcpStrength({
      profileName: "Cold-chain 3PLs",
      description: "Operators who store and move temperature-sensitive freight.",
      customPrompt: "cold-chain 3PL operators hiring warehouse leads",
      industries: ["Logistics & Fleet"],
      territories: [],
    });
    expect(noCountry.band).not.toBe("strong");
    expect(noCountry.hint.toLowerCase()).toContain("country");

    const withBuyers = scoreIcpStrength({
      profileName: "Cold-chain 3PLs",
      description: "Operators who store and move temperature-sensitive freight.",
      customPrompt: "cold-chain 3PL operators hiring warehouse leads",
      industries: ["Logistics & Fleet"],
      territories: ["Lagos, Nigeria"],
      decisionMakers: ["Head of Sales"],
      keywords: ["last-mile", "3PL", "cold-chain", "warehouse"],
    });
    expect(withBuyers.score).toBeGreaterThan(strong.score);
  });

  it("flags generic filler briefs as insufficient", () => {
    expect(isInsufficientIcpSearchBrief({ customPrompt: "companies" })).toBe(true);
    expect(isInsufficientIcpSearchBrief({ customPrompt: "decision makers" })).toBe(true);
    expect(isInsufficientIcpSearchBrief({ customPrompt: "" })).toBe(true);
    expect(
      isInsufficientIcpSearchBrief({
        customPrompt: "earthmoving and plant-hire expanding abroad",
      })
    ).toBe(false);
  });

  it("appends entity mode cues", () => {
    expect(withEntityModeCue("give me prospects", "both")).toBe("give me prospects");
    expect(withEntityModeCue("give me prospects", "companies")).toBe(
      "give me prospects (companies only)"
    );
    expect(withEntityModeCue("give me prospects", "people")).toBe(
      "give me prospects (people only)"
    );
    expect(entityModeLabel("both")).toBe("accounts + people");
  });

  it("composes a search geo caption from territories", () => {
    expect(composeSearchGeoCaption(["Nigeria", "Lagos, NG"])).toContain("Nigeria");
    expect(composeSearchGeoCaption(["Nigeria", "Lagos, NG"])).not.toBe("");
    expect(composeSearchGeoCaption([])).toBe("");
    expect(composeSearchGeoCaption(null)).toBe("");
  });

  it("keeps the search brief topic-only without territories", () => {
    expect(
      composeIcpSearchBrief({
        customPrompt: "logistics 3PL operators",
        industries: ["Logistics"],
      })
    ).toBe("logistics 3PL operators");
  });

  it("encodes confirm count in the chat body without flipping generic asks", () => {
    expect(withProspectCountCue("give me prospects", 12)).toBe("give me prospects");
    expect(withProspectCountCue("give me prospects", 25)).toBe("give me 25 prospects");
    expect(withProspectCountCue("give me prospects (companies only)", 40)).toBe(
      "give me 40 prospects (companies only)"
    );
    expect(withProspectCountCue("find 50 logistics companies", 25)).toBe(
      "find 50 logistics companies"
    );
  });

  it("suggests logistics search nouns without geography", () => {
    const suggestion = suggestIcpSearchBriefLocal({
      industries: ["Logistics & Fleet"],
      description: "Industries specialize in warehousing",
    });
    expect(suggestion.brief.toLowerCase()).toContain("3pl");
    expect(suggestion.brief.toLowerCase()).not.toContain("nigeria");
    expect(suggestion.keywords.length).toBeGreaterThan(0);
  });

  it("rolls unused keyword chips as the prompt fills", () => {
    const pool = expandKeywordPool({
      brief: "3PL warehousing last-mile delivery",
      industries: ["Logistics & Fleet"],
      existing: ["cold-chain", "freight"],
    });
    expect(pool.length).toBeGreaterThan(4);
    const visible = nextVisibleKeywords(pool, "3PL warehousing last-mile", 6);
    expect(visible.every((k) => !"3pl warehousing last-mile".includes(k.toLowerCase()))).toBe(true);
    expect(visible.length).toBeGreaterThan(0);
  });

  it("handles null or undefined customPrompt safely without throwing", () => {
    expect(isInsufficientIcpSearchBrief({ customPrompt: null })).toBe(true);
    expect(isInsufficientIcpSearchBrief({ customPrompt: undefined })).toBe(true);
    expect(
      composeIcpSearchBrief({
        customPrompt: null,
        description: "Logistics warehouse operators",
      })
    ).toBe("Logistics warehouse operators");
  });

  it("clamps the ICP brief at 40 words", () => {
    const fortyOne = Array.from({ length: 41 }, (_, i) => `w${i + 1}`).join(" ");
    const clamped = clampToMaxWords(fortyOne, ICP_BRIEF_MAX_WORDS);
    expect(countWords(clamped)).toBe(40);
    expect(wordsRemaining(clamped)).toBe(0);
  });

  it("splits a long brief into short search queries instead of chopping silently", () => {
    const brief =
      "cold chain logistics providers hiring ops leads, warehouse automation vendors, or last mile delivery fleets expanding abroad";
    const queries = splitBriefIntoSearchQueries(brief);
    expect(queries.length).toBeGreaterThan(1);
    for (const q of queries) {
      expect(countWords(q)).toBeLessThanOrEqual(12);
    }
    expect(queries.some((q) => q.toLowerCase().includes("cold chain"))).toBe(true);
    expect(queries.some((q) => q.toLowerCase().includes("last mile"))).toBe(true);
  });
});

