"use client";

import { create } from "zustand";

export type CreditMeta = {
  balance: number | null;
  low: boolean;
  blocked: boolean;
  metered: boolean;
};

type MapCreditStore = {
  /** Latest credit signal emitted by a metered Places response. */
  lastMeta: CreditMeta | null;
  /** Client timestamp (ms) of the last signal — drives the throttled watcher. */
  lastEventAt: number;
  ingest: (meta: CreditMeta) => void;
};

export const useMapCreditStore = create<MapCreditStore>((set) => ({
  lastMeta: null,
  lastEventAt: 0,
  ingest: (meta) => set({ lastMeta: meta, lastEventAt: Date.now() }),
}));

/**
 * Feed a Places response's `credits` meta into the store. Safe to call from
 * non-React modules (the map/search utilities). No-ops when the payload has no
 * credit block (e.g. a shared-cache hit that intentionally omits it).
 */
export function ingestCreditMeta(meta: unknown): void {
  if (!meta || typeof meta !== "object") return;
  const record = meta as Record<string, unknown>;
  if (!("metered" in record) && !("low" in record) && !("blocked" in record)) {
    return;
  }
  useMapCreditStore.getState().ingest({
    balance: typeof record.balance === "number" ? record.balance : null,
    low: Boolean(record.low),
    blocked: Boolean(record.blocked),
    metered: Boolean(record.metered),
  });
}
