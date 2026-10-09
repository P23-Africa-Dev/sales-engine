/**
 * Mirrors backend QueryIntentService::isGenericLeadRequest + ChatIntentResolver::looksLikeLeadGeneration
 * so the confirm card only appears when the ask is vague.
 */

export function stripProspectCountInstruction(query: string): string {
  let stripped = query.replace(
    /\s*\(\s*find\s+\d+\s+prospects?\s+unless\s+a\s+different\s+number\s+is\s+specified\.?\s*\)\s*/giu,
    " "
  );
  stripped = stripped.replace(/\s*\(\s*find\s+\d+\s+(?:prospects?|leads?)\.??\s*\)\s*/giu, " ");
  stripped = stripped.replace(/^\s*find\s+\d{1,3}\s+(?:prospects?|leads?)\.?\s*/iu, "");
  return stripped.replace(/\s+/gu, " ").trim();
}

export function stripEntityModeCue(query: string): string {
  let stripped = query.replace(/\s*\((?:companies|people|accounts|contacts)\s+only\)\s*$/iu, "");
  stripped = stripped.replace(/\s+(?:companies|people|accounts|contacts)\s+only\s*$/iu, "");
  return stripped.replace(/\s+/gu, " ").trim();
}

const GENERIC_STOPWORDS =
  /\b(generate|create|find|get|show|give|need|needs|want|please|me|my|the|a|an|some|any|new|more|kind|kinds|ideal|best|perfect|right|suitable|matching|relevant|to|for|based|on|using|according|active|icp|profile|build|search|anything|prospect|request|help|helps|helping|looking|looking for|of|with|our|your|brand|brands|business|company|companies|product|products|app|application|platform|startup|leads?|prospects?|contacts?|same|additional|extra|again|another|that|this|these|those|than|then|can|could|will|would|should|further|advance|advancing|grow|growing|growth|support|supporting|goal|goals|aim|aims|purpose|purposes|success|improve|improving|scale|scaling|fit|fits|fitting|only|accounts?|people|persons?)\b/giu;

/**
 * True when the prompt has no real targeting content (industries, places, niches)
 * and is just a generic "generate leads / relevant to my ICP" instruction.
 */
export function isGenericLeadRequest(query: string): boolean {
  const normalized = stripEntityModeCue(stripProspectCountInstruction(query)).toLowerCase();
  if (normalized === "") {
    return true;
  }

  if (
    /\b(further|help|advance|grow|support|improve|scale)\s+(my|our|the)\s+(need|needs|business|goals?|aims?|purpose|success|company|brand)\b/u.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\b(prospects?|leads?)\s+that\s+(can|will|could)\s+(further|help|advance|grow|support|fit)\b/u.test(
      normalized
    )
  ) {
    if (!/\b(this|that|these|those)\b/u.test(normalized)) {
      return true;
    }
  }

  let residual = normalized.replace(GENERIC_STOPWORDS, " ");
  residual = residual.replace(/[^\p{L}\p{N}\s]+/gu, " ");
  residual = residual.replace(/\s+/gu, " ").trim();

  return residual === "" || residual.length < 3;
}

/** Mirrors ChatIntentResolver::looksLikeLeadGeneration for freeform → confirm routing. */
export function looksLikeLeadGeneration(body: string): boolean {
  const normalized = body.trim().toLowerCase();
  if (normalized === "") {
    return false;
  }

  const patterns = [
    /\b(create|generate|find|get|show|list|build|make|add)\s+(?:(?:a|me|us|some|new)\s+)*(?:leads?|prospects?)\b/u,
    /\bleads?\s+for\b/u,
    /\b(find|get|show|list|give)\s+(?:me\s+)?(?:some\s+)?(prospects?|contacts?|companies|accounts|leads?)\b/u,
    /\b(save|sync|add)\s+(these|them|all|selected)?\s*(to\s+)?(crm|pipeline)\b/u,
    /\btop\s+\d{1,2}\b/u,
    /\b\d{1,3}\s+(leads?|prospects?|contacts?|people|companies)\b/u,
    /\b(all|each)\s+of\s+(these|them|those)\b/u,
    /\b(these|those|them)\s+(top\s+)?\d*\s*(wealthiest|richest|best|important|key)\b/u,
    /\bwealthiest\s+(men|people|persons|individuals|executives)\b/u,
    /\bgenerate\s+new\s+leads\b/u,
    /\bprovide\s+(me\s+)?(necessary\s+)?leads?\b/u,
    /\bleads?\s+that\s+(will|can|could)\b/u,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

/**
 * Confirm card only when the system would invent the search from the ICP brief.
 * Specific niche asks skip the card and search the user's text.
 */
export function shouldShowIcpConfirmCard(
  intent: "generate_leads" | "freeform" | string,
  body: string
): boolean {
  if (intent === "generate_leads") {
    return isGenericLeadRequest(body);
  }
  if (intent === "freeform") {
    return looksLikeLeadGeneration(body) && isGenericLeadRequest(body);
  }
  return false;
}
