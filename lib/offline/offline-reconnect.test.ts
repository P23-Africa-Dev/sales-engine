import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOfflineReconnectHandler,
  OFFLINE_RECONNECT_PROBE_MS,
} from "@/lib/offline/offline-reconnect";

describe("offline-reconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exposes the default probe interval", () => {
    expect(OFFLINE_RECONNECT_PROBE_MS).toBe(5000);
  });

  it("reloads when the browser fires online", () => {
    const reload = vi.fn();

    const reconnect = createOfflineReconnectHandler({
      reload,
      isOnline: () => false,
    });

    reconnect.startListening();
    window.dispatchEvent(new Event("online"));

    expect(reload).toHaveBeenCalledTimes(1);
    reconnect.stopListening();
  });

  it("reloads when a connectivity probe succeeds", async () => {
    const reload = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });

    const reconnect = createOfflineReconnectHandler({
      reload,
      fetchFn,
      isOnline: () => false,
      probeIntervalMs: 1000,
    });

    reconnect.startListening();
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchFn).toHaveBeenCalledWith("/manifest.webmanifest", {
      method: "HEAD",
      cache: "no-store",
    });
    expect(reload).toHaveBeenCalledTimes(1);
    reconnect.stopListening();
  });

  it("stops listening and probing on cleanup", async () => {
    const reload = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });

    const reconnect = createOfflineReconnectHandler({
      reload,
      fetchFn,
      isOnline: () => false,
      probeIntervalMs: 1000,
    });

    reconnect.startListening();
    reconnect.stopListening();

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(2000);

    expect(reload).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
