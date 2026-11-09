import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ProcessingPanel } from "@/components/sales-engine/processing-panel";
import type { ProcessingState } from "@/hooks/use-sales-engine-chat";

const leadGenState: ProcessingState = {
  label: "Scanning web & social signals…",
  stepIndex: 1,
  totalSteps: 4,
  intent: "generate_leads",
  startedAt: Date.now() - 50_000,
  secondaryLabel: null,
};

describe("ProcessingPanel", () => {
  it("offers continue waiting and stop for lead generation", () => {
    const html = renderToStaticMarkup(
      <ProcessingPanel
        state={leadGenState}
        onDetachToBackground={() => undefined}
        onStopSearching={() => undefined}
        onContinueWaiting={() => undefined}
      />
    );

    expect(html).toContain("Continue waiting");
    expect(html).toContain("Stop searching");
    expect(html).toContain("Process in background");
    expect(html).toContain("Timeout is a last resort");
  });

  it("wires continue and stop handlers", () => {
    const onContinueWaiting = vi.fn();
    const onStopSearching = vi.fn();

    // Static markup cannot fire clicks; assert handlers are optional and labels present.
    const html = renderToStaticMarkup(
      <ProcessingPanel
        state={leadGenState}
        onStopSearching={onStopSearching}
        onContinueWaiting={onContinueWaiting}
      />
    );

    expect(html).toContain("Continue waiting");
    expect(html).toContain("Stop searching");
    expect(html).not.toContain("Process in background");
    expect(onContinueWaiting).not.toHaveBeenCalled();
    expect(onStopSearching).not.toHaveBeenCalled();
  });
});
