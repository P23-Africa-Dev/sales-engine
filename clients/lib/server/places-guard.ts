import { NextResponse } from "next/server";

/**
 * In-memory cost guards for the Google Places proxy routes:
 *   - shared TTL response cache (so repeat/adjacent viewports reuse one billed call)
 *   - per-client fixed-window rate limit
 *   - global daily billed-call budget (circuit breaker)
 *
 * State is per server instance. On multi-instance / serverless deployments this
 * still dampens bursts and warm-instance repeats; swap the Maps below for Redis
 * (e.g. Upstash) if you need a globally shared cache/limit/budget.
 *
 * All thresholds are env-tunable so the cost tier can be changed without a deploy:
 *   PLACES_CACHE_TTL_MS          (default 600000 = 10 min)
 *   PLACES_RATE_WINDOW_MS        (default 60000  = 1 min)
 *   PLACES_RATE_MAX_PER_WINDOW   (default 30; 0 disables rate limiting)
 *   PLACES_DAILY_CALL_BUDGET     (default 200 billed Google calls/day/instance;
 *                                set 0 for unlimited — not recommended in prod)
 *
 * For multi-instance / serverless deployments, swap the Maps below for Redis
 * (e.g. Upstash) so cache/limit/budget are shared globally.
 */

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// ── TTL response cache ────────────────────────────────────────────────────────
type CacheEntry = { value: unknown; expiresAt: number };
const CACHE = new Map<string, CacheEntry>();
const CACHE_MAX_ENTRIES = 2000;
const CACHE_TTL_MS = readNumberEnv("PLACES_CACHE_TTL_MS", 10 * 60 * 1000);

function getCached(key: string): unknown | null {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    CACHE.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key: string, value: unknown, ttlMs = CACHE_TTL_MS): void {
  if (CACHE.size >= CACHE_MAX_ENTRIES) {
    const drop = Math.ceil(CACHE_MAX_ENTRIES * 0.1);
    let removed = 0;
    for (const k of CACHE.keys()) {
      CACHE.delete(k);
      if (++removed >= drop) break;
    }
  }
  CACHE.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── Per-client fixed-window rate limit ───────────────────────────────────────
type RateEntry = { count: number; resetAt: number };
const RATE = new Map<string, RateEntry>();
const RATE_WINDOW_MS = readNumberEnv("PLACES_RATE_WINDOW_MS", 60_000);
const RATE_MAX = readNumberEnv("PLACES_RATE_MAX_PER_WINDOW", 30);

function checkRateLimit(clientId: string): boolean {
  if (RATE_MAX <= 0) return true;
  const now = Date.now();
  const entry = RATE.get(clientId);
  if (!entry || now > entry.resetAt) {
    RATE.set(clientId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

// ── Daily billed-call budget (circuit breaker) ───────────────────────────────
// Default 200 caps spend ~Nearby Pro worst-case at a few dollars/day per instance.
const DAILY_BUDGET = readNumberEnv("PLACES_DAILY_CALL_BUDGET", 200);
let budgetDayKey = currentDayKey();
let budgetCount = 0;

function currentDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollBudgetDay(): void {
  const day = currentDayKey();
  if (day !== budgetDayKey) {
    budgetDayKey = day;
    budgetCount = 0;
  }
}

function budgetExceeded(): boolean {
  if (DAILY_BUDGET <= 0) return false;
  rollBudgetDay();
  return budgetCount >= DAILY_BUDGET;
}

function recordBilledCall(): void {
  if (DAILY_BUDGET <= 0) return;
  rollBudgetDay();
  budgetCount += 1;
}

export function clientIdFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export type PlacesGuardResult = {
  /** When true, return `response` immediately (rate-limited or over budget). */
  blocked: boolean;
  response: Response | null;
  /** Non-null => serve this cached payload (no upstream Google call needed). */
  cached: unknown | null;
  /** Call after a successful upstream fetch to cache the payload + count the billed call. */
  store: (value: unknown, ttlMs?: number) => void;
};

/**
 * Run rate-limit, cache-hit and daily-budget checks for a Places proxy request.
 * `overBudgetPayload` is returned (200) when the daily budget is hit, so the
 * client degrades gracefully (empty results) instead of erroring.
 */
export function guardPlacesRequest(opts: {
  clientId: string;
  sku: string;
  cacheKey?: string;
  overBudgetPayload?: unknown;
}): PlacesGuardResult {
  const noop = () => {};

  if (!checkRateLimit(opts.clientId)) {
    return {
      blocked: true,
      response: NextResponse.json(
        { error: "Too many requests", sku: opts.sku },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(RATE_WINDOW_MS / 1000)) },
        },
      ),
      cached: null,
      store: noop,
    };
  }

  if (opts.cacheKey) {
    const hit = getCached(opts.cacheKey);
    if (hit !== null) {
      return { blocked: false, response: null, cached: hit, store: noop };
    }
  }

  if (budgetExceeded()) {
    return {
      blocked: true,
      response: NextResponse.json(opts.overBudgetPayload ?? { enabled: true }, {
        status: 200,
        headers: { "X-Places-Budget": "exceeded" },
      }),
      cached: null,
      store: noop,
    };
  }

  return {
    blocked: false,
    response: null,
    cached: null,
    store: (value: unknown, ttlMs?: number) => {
      recordBilledCall();
      if (opts.cacheKey) setCached(opts.cacheKey, value, ttlMs);
    },
  };
}
