"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCountries, type CountryOption } from "@/lib/api/enterprise";
import { useGeographyLgas, useGeographyStates } from "@/hooks/use-geography";

const EMPTY_COUNTRIES: CountryOption[] = [];

type ZoneLocationPickerProps = {
  countryCode: string;
  stateName: string;
  lgaName: string;
  onCountryCodeChange: (value: string) => void;
  onStateNameChange: (value: string) => void;
  onLgaNameChange: (value: string) => void;
  zoneLevel?: "state" | "lga";
  onZoneLevelChange?: (value: "state" | "lga") => void;
};

function resolveCountryCode(country: string, countries: CountryOption[]): string {
  const normalized = country.trim();
  if (normalized.length === 2) {
    return normalized.toUpperCase();
  }

  const match = countries.find(
    (item) =>
      item.value.toLowerCase() === normalized.toLowerCase()
      || item.label.toLowerCase() === normalized.toLowerCase()
      || item.code?.toUpperCase() === normalized.toUpperCase(),
  );

  return match?.code?.toUpperCase() ?? normalized.slice(0, 2).toUpperCase();
}

export function ZoneLocationPicker({
  countryCode,
  stateName,
  lgaName,
  onCountryCodeChange,
  onStateNameChange,
  onLgaNameChange,
  zoneLevel = "lga",
  onZoneLevelChange,
}: ZoneLocationPickerProps) {
  const countriesQuery = useQuery({
    queryKey: ["countries"],
    queryFn: getCountries,
    staleTime: 1000 * 60 * 60,
  });
  const countries = useMemo(
    () => countriesQuery.data ?? EMPTY_COUNTRIES,
    [countriesQuery.data],
  );

  const countryOptions = useMemo(
    () =>
      countries.map((country) => ({
        label: country.label,
        value: country.code?.toUpperCase() ?? resolveCountryCode(country.value, countries),
      })),
    [countries],
  );

  const { data: statesData, isLoading: loadingStates } = useGeographyStates(countryCode);
  const { data: lgasData, isLoading: loadingLgas } = useGeographyLgas(
    countryCode,
    stateName || undefined,
  );

  const statesSupported = statesData?.supported ?? false;
  const lgasSupported = lgasData?.supported ?? false;
  const stateOptions = statesData?.states ?? [];
  const lgaOptions = lgasData?.lgas ?? [];

  return (
    <div className="space-y-4">
      {onZoneLevelChange ? (
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Zone coverage
          </label>
          <div className="flex gap-2">
            {([
              { value: "state", label: "Whole state" },
              { value: "lga", label: "Specific LGA" },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onZoneLevelChange(option.value)}
                className={`px-3 py-2 rounded-xl text-[12px] font-bold border transition-all ${
                  zoneLevel === option.value
                    ? "bg-dash-dark text-white border-dash-dark"
                    : "bg-gray-50 text-gray-500 border-gray-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Country
        </label>
        <select
          value={countryCode}
          onChange={(event) => {
            onCountryCodeChange(event.target.value);
            onStateNameChange("");
            onLgaNameChange("");
          }}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px]"
        >
          <option value="">Select country</option>
          {countryOptions.map((country) => (
            <option key={country.value} value={country.value}>
              {country.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          State / Region
        </label>
        {statesSupported ? (
          <select
            value={stateName}
            onChange={(event) => {
              onStateNameChange(event.target.value);
              onLgaNameChange("");
            }}
            disabled={!countryCode || loadingStates}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px]"
          >
            <option value="">{loadingStates ? "Loading states..." : "Select state"}</option>
            {stateOptions.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={stateName}
            onChange={(event) => onStateNameChange(event.target.value)}
            placeholder="Enter state or region"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px]"
          />
        )}
      </div>

      {zoneLevel === "lga" ? (
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Local Government / District
          </label>
          {lgasSupported ? (
            <select
              value={lgaName}
              onChange={(event) => onLgaNameChange(event.target.value)}
              disabled={!stateName || loadingLgas}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px]"
            >
              <option value="">{loadingLgas ? "Loading areas..." : "Select local area"}</option>
              {lgaOptions.map((lga) => (
                <option key={lga} value={lga}>
                  {lga}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={lgaName}
              onChange={(event) => onLgaNameChange(event.target.value)}
              placeholder="Enter local government or district"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px]"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function resolveDefaultCountryCode(
  organizationCountry: string | null | undefined,
  countries: CountryOption[],
): string {
  if (!organizationCountry) {
    return "NG";
  }

  return resolveCountryCode(organizationCountry, countries);
}
