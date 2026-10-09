/**
 * Mirrors backend IcpBrief::searchBrief() / searchQueries() priority:
 * customPrompt → description → industries → neutral fallback.
 * Territory / size / revenue / personas are gates only — never search text.
 */

export type IcpSearchBriefInput = {
  customPrompt?: string | null;
  description?: string | null;
  industries?: string[] | null;
};

/** Live cap in the ICP builder — words the user may type. */
export const ICP_BRIEF_MAX_WORDS = 40;

/** Each Serper query stays short so results are companies, not essays. */
export const ICP_SEARCH_QUERY_MAX_WORDS = 12;

export const ICP_SEARCH_QUERY_MAX_CLAUSES = 6;

const GENERIC_BRIEF_FILLERS = new Set([
  "companies",
  "company",
  "decision",
  "makers",
  "maker",
  "prospects",
  "prospect",
  "leads",
  "lead",
  "accounts",
  "account",
  "businesses",
  "business",
  "customers",
  "customer",
  "buyers",
  "buyer",
  "people",
  "persons",
  "and",
  "the",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "your",
  "our",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "or",
]);

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return (trimmed.match(/\S+/g) ?? []).length;
}

/** Keep at most `maxWords` words; preserve trailing space while typing when under the cap. */
export function clampToMaxWords(text: string, maxWords: number = ICP_BRIEF_MAX_WORDS): string {
  if (maxWords < 1) return "";
  const matches = text.match(/\S+/g) ?? [];
  if (matches.length <= maxWords) return text;
  // Rebuild from word starts so we drop anything after the Nth word.
  let seen = 0;
  let end = 0;
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    seen += 1;
    end = m.index + m[0].length;
    if (seen >= maxWords) break;
  }
  return text.slice(0, end);
}

export function wordsRemaining(text: string, maxWords: number = ICP_BRIEF_MAX_WORDS): number {
  return Math.max(0, maxWords - countWords(text));
}

/**
 * Full human brief (what is stored). Not silently truncated.
 */
export function composeIcpSearchBrief(input: IcpSearchBriefInput): string {
  const interest = (input.customPrompt ?? "").trim();
  if (interest) return interest;

  const description = (input.description ?? "").trim();
  if (description) return description;

  const industries = (input.industries ?? [])
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  if (industries.length > 0) {
    return `${industries.join(" ")} companies`;
  }

  return "companies announcements partnerships market entry";
}

/**
 * Short queries that will actually hit Serper (mirrors backend searchQueries).
 */
export function composeIcpSearchQueries(input: IcpSearchBriefInput & { keywords?: string[] | null }): string[] {
  const brief = composeIcpSearchBrief(input);
  const clauses = splitBriefIntoSearchQueries(brief);
  const keywords = (input.keywords ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  for (const keyword of keywords) {
    const clamped = clampToMaxWords(keyword, ICP_SEARCH_QUERY_MAX_WORDS).trim();
    if (clamped && !clauses.includes(clamped)) clauses.push(clamped);
    if (clauses.length >= ICP_SEARCH_QUERY_MAX_CLAUSES) break;
  }
  return clauses;
}

export function splitBriefIntoSearchQueries(
  brief: string,
  maxClauses: number = ICP_SEARCH_QUERY_MAX_CLAUSES,
  maxWords: number = ICP_SEARCH_QUERY_MAX_WORDS,
): string[] {
  const text = brief.trim().replace(/\s+/g, " ");
  if (!text) return [];

  const wordCount = countWords(text);
  if (wordCount <= maxWords) {
    return [text];
  }

  const parts = text
    .split(/\s*(?:,|;|\n|\bor\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const clauses: string[] = [];
  for (const part of parts) {
    const clamped = clampToMaxWords(part, maxWords).trim();
    if (!clamped) continue;
    if (!clauses.includes(clamped)) clauses.push(clamped);
    if (clauses.length >= maxClauses) break;
  }

  if (clauses.length === 0) {
    return [clampToMaxWords(text, maxWords).trim()].filter(Boolean);
  }

  return clauses;
}

/**
 * True when the composed brief is empty or only generic filler (no niche nouns).
 * Used to require a real "What we search for" before save/activate.
 */
export function isInsufficientIcpSearchBrief(input: IcpSearchBriefInput): boolean {
  const custom = (input.customPrompt ?? "").trim();
  if (!custom) {
    const description = (input.description ?? "").trim();
    if (!description) return true;
    return isMostlyGenericFiller(description);
  }

  return isMostlyGenericFiller(custom);
}

function isMostlyGenericFiller(text: string): boolean {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}\-&]+/u)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const concrete = tokens.filter((t) => t.length >= 3 && !GENERIC_BRIEF_FILLERS.has(t));
  return concrete.length === 0;
}

export function composeSearchGeoCaption(territories?: string[] | null): string {
  const unique = [
    ...new Set(
      (territories ?? [])
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    ),
  ];
  if (unique.length === 0) return "";

  const shown = unique.slice(0, 3);
  const extra = unique.length > 3 ? ` +${unique.length - 3}` : "";
  return `Searching in: ${shown.join(" · ")}${extra}`;
}

export type IcpStrengthBand = "weak" | "fair" | "strong";

export type IcpStrengthScore = {
  score: number;
  band: IcpStrengthBand;
  label: string;
  hint: string;
};

/**
 * Live ICP strength from what the user has typed.
 * Territory and a concrete search brief are required to reach "Strong".
 * Size and revenue are not scored — they stay filters, not search text.
 */
export function scoreIcpStrength(input: {
  profileName?: string | null;
  description?: string | null;
  customPrompt?: string | null;
  industries?: string[] | null;
  territories?: string[] | null;
  decisionMakers?: string[] | null;
  keywords?: string[] | null;
}): IcpStrengthScore {
  const name = (input.profileName ?? "").trim();
  const description = (input.description ?? "").trim();
  const brief = (input.customPrompt ?? "").trim();
  const industries = (input.industries ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const territories = (input.territories ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const buyers = (input.decisionMakers ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const keywords = (input.keywords ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const clauses = composeIcpSearchQueries({
    customPrompt: brief,
    description,
    industries,
    keywords,
  });

  const briefConcrete = brief !== "" && !isInsufficientIcpSearchBrief({ customPrompt: brief });
  const words = countWords(brief);
  const copiesStory =
    brief !== "" && description !== "" && brief.toLowerCase() === description.toLowerCase();
  const readsLikeDefinition = /industries specialize/i.test(brief);

  let score = 0;
  if (briefConcrete) score += 34;
  if (words >= 6) score += 12;
  else if (words >= 3) score += 6;
  if (briefConcrete && !copiesStory && !readsLikeDefinition) score += 8;
  if (territories.length > 0) score += 18;
  if (industries.length > 0) score += 8;
  if (buyers.length > 0) score += 8;
  if (keywords.length >= 4) score += 6;
  else if (keywords.length > 0) score += 3;
  if (clauses.length >= 2) score += 4;
  if (name && description) score += 4;

  if (!briefConcrete) score = Math.min(score, 39);
  if (territories.length === 0) score = Math.min(score, 64);
  score = Math.max(0, Math.min(100, score));

  const band: IcpStrengthBand = score >= 75 ? "strong" : score >= 45 ? "fair" : "weak";
  const label = band === "strong" ? "Strong" : band === "fair" ? "Fair" : "Weak";

  let hint = "This ICP is strong enough to search.";
  if (territories.length === 0) {
    hint = "Add a catalog country or city. Discovery drops leads outside your territories.";
  } else if (!briefConcrete) {
    hint = "The search brief is still vague. Name products, buyers, or exclusions.";
  } else if (copiesStory || readsLikeDefinition) {
    hint = "This reads like a profile story. Search works better with products and buyers.";
  } else if (industries.length === 0) {
    hint = "Pick an industry so weaker fits can be filtered out.";
  } else if (buyers.length === 0) {
    hint = "Add a buyer role so people searches know who to look for.";
  } else if (band !== "strong") {
    hint = "Add a bit more specificity, or strengthen the search brief.";
  }

  return { score, band, label, hint };
}

export function composeIcpQualifySummary(input: {
  industries?: string[] | null;
  territories?: string[] | null;
  companySizes?: string[] | null;
  revenueRanges?: string[] | null;
}): string {
  const parts = [
    ...(input.industries ?? []).filter(Boolean),
    ...(input.territories ?? []).filter(Boolean),
    ...(input.companySizes ?? []).filter(Boolean),
    ...(input.revenueRanges ?? []).filter(Boolean),
  ];
  return parts.length > 0 ? parts.join(" · ") : "No firmographic filters set";
}

export type GenerateEntityMode = "both" | "companies" | "people";

export function entityModeLabel(mode: GenerateEntityMode): string {
  switch (mode) {
    case "companies":
      return "accounts only";
    case "people":
      return "people only";
    default:
      return "accounts + people";
  }
}

/** Append a cue the backend QueryIntentService already understands. */
export function withEntityModeCue(body: string, mode: GenerateEntityMode): string {
  const trimmed = body.trim();
  if (mode === "both") return trimmed;
  if (/\(\s*(companies|people|accounts|contacts)\s+only\s*\)\s*$/i.test(trimmed)) {
    return trimmed;
  }
  if (mode === "companies") return `${trimmed} (companies only)`;
  return `${trimmed} (people only)`;
}

export type GenerateProspectCount = 12 | 25 | 40;

/** Encode confirm-card count in chat body so QueryIntentService.parseLimit sees it. */
export function withProspectCountCue(body: string, count: GenerateProspectCount): string {
  const trimmed = body.trim();
  const alreadyNumbered =
    /\b(?:give me|find|get|show|list|need|want)\s+\d{1,3}\b/i.test(trimmed) ||
    /\b\d{1,3}\s+(?:people|persons|leads|prospects|contacts|names|executives|companies|accounts)\b/i.test(
      trimmed
    );
  if (alreadyNumbered) return trimmed;
  if (count === 12) return trimmed;
  if (/^give me prospects\b/i.test(trimmed)) {
    return trimmed.replace(/^give me prospects/i, `give me ${count} prospects`);
  }
  return `give me ${count} prospects`;
}

const INDUSTRY_SEARCH_SEEDS: Array<[needle: string, seed: string]> = [
  ["logistics", "3PL warehousing last-mile delivery"],
  ["fleet", "3PL freight fleet operators"],
  ["fmcg", "FMCG distributors wholesale retail chains"],
  ["retail", "retail distributors supermarket chains"],
  ["fintech", "payments processors lending platforms"],
  ["payment", "payments processors merchant acquiring"],
  ["health", "healthcare distributors pharmacies clinics"],
  ["pharma", "pharma distributors hospital suppliers"],
  ["manufactur", "industrial manufacturers plant equipment"],
  ["energy", "energy utilities power distributors"],
  ["utilit", "utilities power water distributors"],
  ["construction", "construction contractors developers"],
  ["real estate", "property developers commercial real estate"],
  ["agro", "agribusiness commodity traders processors"],
  ["commodit", "commodity traders agribusiness processors"],
  ["software", "SaaS platforms software vendors product companies"],
  ["tech", "technology product companies software platforms"],
  ["saas", "SaaS platforms B2B software vendors"],
  ["develop", "software product companies engineering platforms"],
  ["mobile", "mobile app product companies digital platforms"],
];

export type IcpSearchBriefSuggestion = {
  brief: string;
  keywords: string[];
};

const VISIBLE_KEYWORD_COUNT = 6;

/** Instant, no-network draft from selected industries. Geography stays out. */
export function suggestIcpSearchBriefLocal(input: {
  industries?: string[] | null;
  description?: string | null;
  profileName?: string | null;
}): IcpSearchBriefSuggestion {
  const parts: string[] = [];
  for (const industry of input.industries ?? []) {
    const lower = industry.toLowerCase();
    const match = INDUSTRY_SEARCH_SEEDS.find(([needle]) => lower.includes(needle));
    if (match) {
      parts.push(match[1]);
      continue;
    }
    const nouns = industry.replace(/[&,/]+/g, " ").trim();
    if (nouns) parts.push(`${nouns} companies`);
  }
  const unique = [...new Set(parts)].slice(0, 2);
  let brief = unique.join(" ").trim();
  const description = (input.description ?? "").trim();
  if (!brief && description && !/industries specialize/i.test(description)) {
    brief = description;
  }
  if (!brief) {
    const name = (input.profileName ?? "").trim();
    if (name) brief = name;
  }
  brief = clampToMaxWords(brief, ICP_BRIEF_MAX_WORDS).trim();
  return {
    brief,
    keywords: expandKeywordPool({
      brief,
      industries: input.industries,
      existing: [],
    }),
  };
}

/** Build a rolling pool of add-on chips (unused first). */
export function expandKeywordPool(input: {
  brief?: string | null;
  industries?: string[] | null;
  existing?: string[] | null;
  excludeInText?: string | null;
}): string[] {
  const excludeText = (input.excludeInText ?? "").toLowerCase();
  const seen = new Set(
    (input.existing ?? []).map((k) => k.toLowerCase()).filter(Boolean)
  );
  const out: string[] = [];

  const push = (raw: string) => {
    const token = raw.trim();
    if (!token || token.length < 3) return;
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    if (excludeText && excludeText.includes(key)) return;
    seen.add(key);
    out.push(token);
  };

  for (const k of keywordsFromBrief(input.brief ?? "")) push(k);

  for (const industry of input.industries ?? []) {
    const lower = industry.toLowerCase();
    const match = INDUSTRY_SEARCH_SEEDS.find(([needle]) => lower.includes(needle));
    if (!match) {
      for (const part of industry.replace(/[&,/]+/g, " ").split(/\s+/)) push(part);
      continue;
    }
    const words = match[1].split(/\s+/);
    for (const w of words) push(w);
    for (let i = 0; i < words.length - 1; i++) {
      push(`${words[i]} ${words[i + 1]}`);
    }
  }

  for (const k of input.existing ?? []) push(k);

  return out;
}

/** Next unused chips to show under the opportunity box. */
export function nextVisibleKeywords(
  pool: string[],
  prompt: string,
  limit: number = VISIBLE_KEYWORD_COUNT
): string[] {
  const lower = prompt.toLowerCase();
  return pool.filter((k) => !lower.includes(k.toLowerCase())).slice(0, limit);
}

function keywordsFromBrief(brief: string): string[] {
  const fillers = new Set(["and", "the", "for", "with", "from", "into", "that", "this", "companies", "company"]);
  const picked: string[] = [];
  for (const token of brief.toLowerCase().split(/[^\p{L}\p{N}\-&]+/u)) {
    const t = token.trim();
    if (t.length < 3 || fillers.has(t) || picked.includes(t)) continue;
    picked.push(t);
    if (picked.length >= 8) break;
  }
  return picked;
}
