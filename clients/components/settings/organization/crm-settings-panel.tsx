"use client";

import { useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { LabelManagerModal, PipelineManagerModal } from "@/components/crm/crm-toolbar-modals";
import { useCrmLabels, useCrmPipelines } from "@/hooks/use-crm";

export function CrmSettingsPanel() {
  const { companyId } = useSettingsAccess();
  const [showPipelines, setShowPipelines] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);

  const { data: pipelines = [], isLoading: loadingPipelines } = useCrmPipelines(
    companyId ?? undefined,
    "/admin",
  );
  const { data: labels = [], isLoading: loadingLabels } = useCrmLabels(
    companyId ?? undefined,
    "/admin",
  );

  if (!companyId) return null;

  return (
    <>
      <SettingsSectionCard
        title="CRM"
        description="Configure pipelines, stages, and lead labels"
        scope="organization"
      >
        {loadingPipelines || loadingLabels ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-gray-400" size={24} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-gray-100">
                <p className="text-[13px] font-bold text-dash-dark">Pipelines</p>
                <p className="text-[12px] text-gray-500 mt-1">
                  {pipelines.length} pipeline{pipelines.length === 1 ? "" : "s"} configured
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPipelineId(pipelines[0]?.id ?? null);
                    setShowPipelines(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-700"
                >
                  <Settings2 size={14} />
                  Manage pipelines
                </button>
              </div>
              <div className="p-4 rounded-xl border border-gray-100">
                <p className="text-[13px] font-bold text-dash-dark">Stage labels</p>
                <p className="text-[12px] text-gray-500 mt-1">
                  {labels.length} label{labels.length === 1 ? "" : "s"} configured
                </p>
                <button
                  type="button"
                  onClick={() => setShowLabels(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-700"
                >
                  <Settings2 size={14} />
                  Manage labels
                </button>
              </div>
            </div>
          </div>
        )}
      </SettingsSectionCard>

      {showPipelines && (
        <PipelineManagerModal
          companyId={companyId}
          apiBasePath="/admin"
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          onSelectPipeline={setSelectedPipelineId}
          onClose={() => setShowPipelines(false)}
        />
      )}
      {showLabels && (
        <LabelManagerModal
          companyId={companyId}
          apiBasePath="/admin"
          labels={labels}
          onClose={() => setShowLabels(false)}
        />
      )}
    </>
  );
}
