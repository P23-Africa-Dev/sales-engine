"use client";

import { SearchableSelect } from "@/components/ui/searchable-select";
import type { CrmLabel, CrmPipeline } from "@/lib/api/crm";

type CrmFilterBarProps = {
  pipelines: CrmPipeline[];
  labels: CrmLabel[];
  selectedPipelineId: number | null;
  onPipelineChange: (pipelineId: number | null) => void;
  selectedLabel: string;
  onLabelChange: (label: string) => void;
  onClear: () => void;
};

export function CrmFilterBar({
  pipelines,
  labels,
  selectedPipelineId,
  onPipelineChange,
  selectedLabel,
  onLabelChange,
  onClear,
}: CrmFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchableSelect
        value={String(selectedPipelineId ?? "")}
        onChange={(value) => onPipelineChange(value ? Number(value) : null)}
        options={[
          { value: "", label: "All Pipelines" },
          ...pipelines.map((pipeline) => ({
            value: String(pipeline.id),
            label: pipeline.name,
          })),
        ]}
        className="se-control border rounded-full px-4 py-2.5 text-[12px] font-medium min-w-32 transition-colors"
      />
      <SearchableSelect
        value={selectedLabel}
        onChange={onLabelChange}
        options={[
          { value: "all", label: "All Labels" },
          ...labels.map((label) => ({ value: label.slug, label: label.name })),
        ]}
        className="se-control border rounded-full px-4 py-2.5 text-[12px] font-medium min-w-28 transition-colors"
      />
      <button
        type="button"
        onClick={onClear}
        className="se-control px-4 py-2.5 border rounded-full text-[12px] font-medium transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
