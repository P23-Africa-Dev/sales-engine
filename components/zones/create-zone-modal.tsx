"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getCountries } from "@/lib/api/enterprise";
import { useCreateCompanyZone } from "@/hooks/use-internal-users";
import {
  resolveDefaultCountryCode,
  ZoneLocationPicker,
} from "@/components/zones/zone-location-picker";

const EMPTY_COUNTRIES: Awaited<ReturnType<typeof getCountries>> = [];

type CreateZoneModalProps = {
  isOpen: boolean;
  onClose: () => void;
  companyId: number | string;
  defaultCountry?: string | null;
  onCreated?: () => void;
};

export function CreateZoneModal({
  isOpen,
  onClose,
  companyId,
  defaultCountry,
  onCreated,
}: CreateZoneModalProps) {
  const [countryCode, setCountryCode] = useState("NG");
  const [stateName, setStateName] = useState("");
  const [lgaName, setLgaName] = useState("");
  const [zoneLevel, setZoneLevel] = useState<"state" | "lga">("lga");
  const [zoneName, setZoneName] = useState("");

  const countriesQuery = useQuery({
    queryKey: ["countries"],
    queryFn: getCountries,
    staleTime: 1000 * 60 * 60,
  });
  const countries = useMemo(
    () => countriesQuery.data ?? EMPTY_COUNTRIES,
    [countriesQuery.data]
  );

  const createMutation = useCreateCompanyZone({
    onSuccess: () => {
      toast.success("Zone created successfully.");
      onCreated?.();
      onClose();
    },
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset zone form when modal opens
    setCountryCode(resolveDefaultCountryCode(defaultCountry, countries));
    setStateName("");
    setLgaName("");
    setZoneLevel("lga");
    setZoneName("");
  }, [isOpen, defaultCountry, countries]);

  if (!isOpen) {
    return null;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!countryCode) {
      toast.error("Select a country.");
      return;
    }

    if (!stateName.trim()) {
      toast.error("Select or enter a state.");
      return;
    }

    const resolvedLga = zoneLevel === "state" ? "All" : lgaName.trim();
    if (zoneLevel === "lga" && !resolvedLga) {
      toast.error("Select or enter a local government area.");
      return;
    }

    createMutation.mutate({
      company_id: companyId,
      country_code: countryCode,
      state_name: stateName.trim(),
      lga_name: resolvedLga,
      name: zoneName.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-[24px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-[16px] font-black text-dash-dark">Create Zone</h3>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Define a coverage area for agent assignment
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          <ZoneLocationPicker
            countryCode={countryCode}
            stateName={stateName}
            lgaName={lgaName}
            zoneLevel={zoneLevel}
            onCountryCodeChange={setCountryCode}
            onStateNameChange={setStateName}
            onLgaNameChange={setLgaName}
            onZoneLevelChange={setZoneLevel}
          />

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Zone name (optional)
            </label>
            <input
              type="text"
              value={zoneName}
              onChange={(event) => setZoneName(event.target.value)}
              placeholder="Auto-generated from state and LGA if left blank"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 py-3 rounded-xl bg-dash-dark text-white text-[13px] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {createMutation.isPending ? "Creating..." : "Create Zone"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
