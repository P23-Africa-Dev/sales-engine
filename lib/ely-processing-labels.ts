/** Late-stage fillers so long waits keep cycling engaging status copy. */
export const LATE_ENGAGEMENT_LABELS = [
  "Retrieving data...",
  "Sorting results...",
  "Almost there...",
  "Just a little more...",
  "Preparing response...",
] as const;

const DEFAULT_PREFIX = ["Thinking...", "Analyzing your request..."] as const;

function withFillers(prefix: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const label of [...prefix, ...LATE_ENGAGEMENT_LABELS]) {
    if (seen.has(label)) continue;
    seen.add(label);
    merged.push(label);
  }

  return merged;
}

/**
 * Intent-aware processing status labels for ELY while a reply is loading.
 * Sequences are long enough to rotate through, then loop via {@link nextProcessingLabelIndex}.
 */
export function labelsForMessage(message: string): string[] {
  const normalized = message.toLowerCase().trim();

  if (/\b(perform|performance|kpi|team|rank)\b/.test(normalized)) {
    return withFillers(["Thinking...", "Analyzing team KPIs...", "Ranking performers..."]);
  }

  if (/\bplan\s+my\s+day\b/.test(normalized)) {
    return withFillers(["Thinking...", "Reviewing your schedule...", "Prioritizing actions..."]);
  }

  if (/\b(crm|lead|follow[\s-]?up)\b/.test(normalized)) {
    return withFillers(["Thinking...", "Scanning CRM records...", "Sorting leads..."]);
  }

  if (/\b(list|show|what|which|how many)\b/.test(normalized) && /\btasks?\b/.test(normalized)) {
    return withFillers(["Thinking...", "Looking up tasks...", "Filtering results..."]);
  }

  if (/\b(create|add|set|assign)\b/.test(normalized) && /\btask\b/.test(normalized)) {
    return withFillers(["Thinking...", "Preparing task...", "Validating details..."]);
  }

  if (/\bmeeting\b/.test(normalized)) {
    return withFillers(["Thinking...", "Checking availability...", "Preparing meeting details..."]);
  }

  if (/\b(overdue)\b/.test(normalized) && /\btasks?\b/.test(normalized)) {
    return withFillers(["Thinking...", "Checking task deadlines..."]);
  }

  if (/\b(attendance|check[\s-]?in)\b/.test(normalized)) {
    return withFillers(["Thinking...", "Pulling attendance data..."]);
  }

  if (/\b(dashboard|overview|metrics)\b/.test(normalized)) {
    return withFillers(["Thinking...", "Loading dashboard metrics..."]);
  }

  return withFillers([...DEFAULT_PREFIX]);
}

/**
 * Advance to the next label index, looping the full sequence so status never freezes.
 */
export function nextProcessingLabelIndex(labels: readonly string[], currentIndex: number): number {
  if (labels.length === 0) return 0;
  return (currentIndex + 1) % labels.length;
}

export const PROCESSING_LABEL_INTERVAL_MS = 1000;
