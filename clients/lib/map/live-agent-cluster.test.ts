import { describe, expect, it } from "vitest";

import {
  LIVE_AGENT_CLUSTER_MAX_ZOOM,
  shouldClusterLiveAgents,
} from "@/lib/map/live-agent-cluster";

describe("live-agent-cluster", () => {
  it("does not cluster when an agent is focused", () => {
    expect(
      shouldClusterLiveAgents(40, 10, { disableClustering: true }),
    ).toBe(false);
  });

  it("clusters only at low zoom with a dense fleet", () => {
    expect(shouldClusterLiveAgents(40, LIVE_AGENT_CLUSTER_MAX_ZOOM - 1)).toBe(true);
    expect(shouldClusterLiveAgents(40, LIVE_AGENT_CLUSTER_MAX_ZOOM)).toBe(false);
    expect(shouldClusterLiveAgents(4, 8)).toBe(false);
  });
});
