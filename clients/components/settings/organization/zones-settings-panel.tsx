"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import {
  useCompanyZones,
  useDeleteCompanyZone,
} from "@/hooks/use-internal-users";
import { getProfile } from "@/lib/api/profile";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { CreateZoneModal } from "@/components/zones/create-zone-modal";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";

export function ZonesSettingsPanel() {
  const { companyId } = useSettingsAccess();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteZoneId, setDeleteZoneId] = useState<number | null>(null);

  const { data: profileData } = useQuery({
    queryKey: ["org-profile"],
    queryFn: async () => {
      const res = await getProfile(token ?? "");
      return res.data;
    },
    enabled: !!token,
  });

  const defaultCountry = profileData?.organization.company.country ?? "NG";
  const { data: zones = [], isLoading } = useCompanyZones(companyId ?? undefined);

  const deleteMutation = useDeleteCompanyZone({
    onSuccess: () => {
      toast.success("Zone deleted.");
      setDeleteZoneId(null);
    },
  });

  const sortedZones = useMemo(
    () => [...zones].sort((a, b) => a.name.localeCompare(b.name)),
    [zones],
  );

  return (
    <>
      <SettingsSectionCard
        title="Company Zones"
        description="Create coverage areas for assigning agents and supervisors"
        scope="organization"
      >
        <div className="flex items-center justify-between gap-3 mb-5">
          <p className="text-[13px] text-gray-500">
            Zones power agent assignment in Add Agent, ELY, and operations screens.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold shrink-0"
          >
            <Plus size={14} />
            Create zone
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-gray-400" size={24} />
          </div>
        ) : sortedZones.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
            <MapPin className="mx-auto text-gray-300 mb-3" size={28} />
            <p className="text-[14px] font-semibold text-dash-dark">No zones yet</p>
            <p className="text-[12px] text-gray-400 mt-1">
              Create your first zone to assign agents to states or local government areas.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedZones.map((zone) => (
              <div
                key={zone.id}
                className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-gray-100 bg-gray-50/60"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-dash-dark truncate">{zone.name}</p>
                  <p className="text-[12px] text-gray-500 mt-1">
                    {zone.state_name} · {zone.lga_name} · {zone.country_code}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteZoneId(zone.id)}
                  className="shrink-0 w-9 h-9 rounded-full border border-red-200 text-red-500 hover:bg-red-50 flex items-center justify-center"
                  aria-label={`Delete ${zone.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsSectionCard>

      {companyId ? (
        <CreateZoneModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          companyId={companyId}
          defaultCountry={defaultCountry}
        />
      ) : null}

      <ConfirmDeleteModal
        isOpen={deleteZoneId !== null}
        onClose={() => setDeleteZoneId(null)}
        title="Delete Zone"
        description="Are you sure you want to delete this zone? Agents assigned to it will be unlinked."
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        onConfirm={() => {
          if (!deleteZoneId || !companyId) return;
          deleteMutation.mutate({ zoneId: deleteZoneId, companyId });
        }}
      />
    </>
  );
}
