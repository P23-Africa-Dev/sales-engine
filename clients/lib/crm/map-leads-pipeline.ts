import type { CrmPipeline } from "@/lib/api/crm";

export const MAP_LEADS_PIPELINE_NAME = "Map Leads";

/** @deprecated Renamed to Map Leads; kept for legacy rows. */
export const LEGACY_MAP_LEADS_PIPELINE_NAME = "Saved from Map";

export function findMapLeadsPipeline(pipelines: CrmPipeline[]): CrmPipeline | undefined {
  return pipelines.find(
    (pipeline) =>
      pipeline.name === MAP_LEADS_PIPELINE_NAME ||
      pipeline.name === LEGACY_MAP_LEADS_PIPELINE_NAME,
  );
}

export function isMapLeadsPipelineSelected(
  pipelines: CrmPipeline[],
  selectedPipelineId: number | null,
): boolean {
  if (selectedPipelineId == null) return false;
  const mapLeadsPipeline = findMapLeadsPipeline(pipelines);
  return mapLeadsPipeline?.id === selectedPipelineId;
}
