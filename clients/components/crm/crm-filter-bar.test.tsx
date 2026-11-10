import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrmFilterBar } from "./crm-filter-bar";
import type { CrmLabel, CrmPipeline } from "@/lib/api/crm";

describe("CrmFilterBar", () => {
  const pipelines: CrmPipeline[] = [
    { id: 101, name: "Outbound Sales", is_default: false, sort_order: 1 },
    { id: 202, name: "Enterprise Deals", is_default: true, sort_order: 0 },
  ];

  const labels: CrmLabel[] = [
    { id: 1, name: "New Lead", slug: "newly_lead", color: "#3B82F6", sort_order: 0, is_default: true, leads_count: 0 },
    { id: 2, name: "Contacted", slug: "contacted", color: "#F59E0B", sort_order: 1, is_default: false, leads_count: 0 },
  ];

  it("displays the default pipeline name when selectedPipelineId matches default pipeline", () => {
    render(
      <CrmFilterBar
        pipelines={pipelines}
        labels={labels}
        selectedPipelineId={202}
        onPipelineChange={vi.fn()}
        selectedLabel="all"
        onLabelChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByText("Enterprise Deals")).toBeTruthy();
  });

  it("displays All Pipelines when selectedPipelineId is null", () => {
    render(
      <CrmFilterBar
        pipelines={pipelines}
        labels={labels}
        selectedPipelineId={null}
        onPipelineChange={vi.fn()}
        selectedLabel="all"
        onLabelChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByText("All Pipelines")).toBeTruthy();
  });

  it("calls onClear when clear button is clicked", () => {
    const onClear = vi.fn();

    render(
      <CrmFilterBar
        pipelines={pipelines}
        labels={labels}
        selectedPipelineId={202}
        onPipelineChange={vi.fn()}
        selectedLabel="all"
        onLabelChange={vi.fn()}
        onClear={onClear}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
