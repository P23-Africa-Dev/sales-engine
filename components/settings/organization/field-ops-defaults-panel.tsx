"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { getCompanySettings, updateCompanySettings } from "@/lib/api/company-settings";

export function FieldOpsDefaultsPanel() {
  const { companyId } = useSettingsAccess();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["company-settings", companyId],
    queryFn: async () => {
      const res = await getCompanySettings(companyId ?? undefined);
      return res.data;
    },
    enabled: !!companyId,
  });

  const [minPhotos, setMinPhotos] = useState(1);
  const [visitVerification, setVisitVerification] = useState(false);

  useEffect(() => {
    if (!data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate form from fetched settings
    setMinPhotos(data.operational_defaults.minimum_photos_required);
    setVisitVerification(data.operational_defaults.visit_verification_required);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      updateCompanySettings({
        company_id: companyId!,
        operational_defaults: {
          minimum_photos_required: minPhotos,
          visit_verification_required: visitVerification,
        },
      }),
    onSuccess: () => {
      toast.success("Field operations defaults saved.");
      queryClient.invalidateQueries({ queryKey: ["company-settings", companyId] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save defaults."),
  });

  const canEdit = data?.can_edit ?? false;

  return (
    <SettingsSectionCard
      title="Field Operations"
      description="Default rules applied when creating new field tasks"
      scope="organization"
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Minimum photos required
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={minPhotos}
              disabled={!canEdit}
              onChange={(e) => setMinPhotos(Number(e.target.value))}
              className="w-full max-w-xs border border-gray-200 rounded-xl px-4 py-3 text-[14px] disabled:opacity-60"
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100">
            <div>
              <p className="text-[13px] font-bold text-dash-dark">Visit verification required</p>
              <p className="text-[11px] text-gray-400">Agents must verify arrival at task location</p>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setVisitVerification((v) => !v)}
              className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-60 ${visitVerification ? "bg-dash-dark" : "bg-gray-300"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${visitVerification ? "translate-x-6" : "translate-x-0"}`}
              />
            </button>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold disabled:opacity-50"
            >
              Save field operations defaults
            </button>
          )}
        </div>
      )}
    </SettingsSectionCard>
  );
}
