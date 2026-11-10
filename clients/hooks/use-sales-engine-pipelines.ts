"use client";

import { useMemo } from "react";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useCrmPipelines, useCrmPreferences } from "@/hooks/use-crm";
import { resolveCrmPipelineId } from "@/lib/crm/resolve-pipeline";
import type { ApiRoleBasePath } from "@/lib/api/crm";
import type { CrmPipelineOption } from "@/components/sales-engine/crm-action-modals";

export function useSalesEngineCrmPipelines() {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const apiBasePath: ApiRoleBasePath = role === "agent" ? "/agent" : "/admin";
  const { data: pipelines = [], isLoading, isError, refetch } = useCrmPipelines(companyId ?? undefined, apiBasePath);
  const { data: preferences } = useCrmPreferences(companyId ?? undefined, apiBasePath);

  const options = useMemo<CrmPipelineOption[]>(
    () => pipelines.map((pipeline) => ({ id: String(pipeline.id), name: pipeline.name })),
    [pipelines]
  );

  const preferredId = resolveCrmPipelineId(
    pipelines,
    preferences?.preferred_pipeline_id,
    preferences?.company_default_pipeline_id
  );

  const orderedOptions = useMemo(() => {
    if (preferredId == null) return options;
    const preferredKey = String(preferredId);
    const preferred = options.find((option) => option.id === preferredKey);
    if (!preferred) return options;
    return [preferred, ...options.filter((option) => option.id !== preferredKey)];
  }, [options, preferredId]);

  return { pipelines: orderedOptions, isLoading, isError, refetch };
}
