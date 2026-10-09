import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PipelineManagerModal } from "./crm-toolbar-modals";
import type { CrmPipeline } from "@/lib/api/crm";

vi.mock("@/hooks/use-crm", () => ({
  useCreateCrmPipeline: () => ({ mutateAsync: vi.fn() }),
  useUpdateCrmPipeline: () => ({ mutateAsync: vi.fn() }),
  useDeleteCrmPipeline: () => ({ mutateAsync: vi.fn() }),
  useSetPreferredCrmPipeline: () => ({ mutateAsync: vi.fn() }),
  useSetCompanyDefaultCrmPipeline: () => ({ mutateAsync: vi.fn() }),
  useCrmPreferences: () => ({ data: { preferred_pipeline_id: 1, company_default_pipeline_id: 1 } }),
  useCreateCrmLabel: () => ({ mutateAsync: vi.fn() }),
  useUpdateCrmLabel: () => ({ mutateAsync: vi.fn() }),
  useDeleteCrmLabel: () => ({ mutateAsync: vi.fn() }),
  useReorderCrmLabels: () => ({ mutateAsync: vi.fn() }),
}));

describe("PipelineManagerModal", () => {
  const pipelines: CrmPipeline[] = [
    { id: 1, name: "Outbound Sales", is_default: true, sort_order: 0 },
    { id: 2, name: "Enterprise Deals", is_default: false, sort_order: 1 },
  ];

  it("selects pipeline and closes modal when clicking anywhere on a pipeline card", () => {
    const onSelectPipeline = vi.fn();
    const onClose = vi.fn();

    render(
      <PipelineManagerModal
        companyId={10}
        apiBasePath="/admin"
        pipelines={pipelines}
        selectedPipelineId={1}
        onSelectPipeline={onSelectPipeline}
        onClose={onClose}
      />
    );

    const enterpriseCard = screen.getByDisplayValue("Enterprise Deals").closest(".group\\/row");
    expect(enterpriseCard).toBeTruthy();
    if (enterpriseCard) {
      fireEvent.click(enterpriseCard);
    }

    expect(onSelectPipeline).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
