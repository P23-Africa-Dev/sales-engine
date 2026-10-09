import type { CrmPipeline } from "@/lib/api/crm";

/**
 * Resolve which pipeline should preselect for create/import:
 * personal preferred → company default → first by sort order.
 */
export function resolveCrmPipelineId(
  pipelines: Array<Pick<CrmPipeline, "id" | "is_default" | "sort_order">>,
  preferredPipelineId?: number | null,
  companyDefaultPipelineId?: number | null,
): number | null {
  if (!pipelines.length) return null;

  const byId = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline]));

  if (preferredPipelineId != null && byId.has(preferredPipelineId)) {
    return preferredPipelineId;
  }

  if (companyDefaultPipelineId != null && byId.has(companyDefaultPipelineId)) {
    return companyDefaultPipelineId;
  }

  const companyDefault = pipelines.find((pipeline) => pipeline.is_default);
  if (companyDefault) return companyDefault.id;

  const sorted = [...pipelines].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }
    return left.id - right.id;
  });

  return sorted[0]?.id ?? null;
}
