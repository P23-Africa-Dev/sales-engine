"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createSearchSessionToken,
  retrievePlace,
  suggestPlaces,
  type PlaceSuggestion,
  type RetrievedPlace,
} from "@/lib/utils/place-search";
import { placeAttributionLabel } from "@/lib/utils/place-attribution";
import { getCachedSearchProximity, warmSearchProximity } from "@/lib/utils/search-proximity";
import {
  fetchRecentPlaces,
  getLocalRecentPlaces,
  recentToSuggestionLike,
  rememberRecentPlace,
  type RecentPlace,
} from "@/lib/map/recent-places";
import { useMapCreditStore } from "@/store/map-credits";

const DEBOUNCE_MS = 300;

export type PlaceAutocompleteFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: RetrievedPlace) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  /** Optional map proximity [lng, lat] to bias results. */
  proximity?: [number, number];
  limit?: number;
  /** When true, show the suggestions panel even if empty (after a search). */
  id?: string;
  name?: string;
  onFocus?: () => void;
  onBlur?: () => void;
};

/**
 * Form-friendly place typeahead via Laravel Places (Geoapify + Foursquare
 * fan-out, Google backstop). Selecting a suggestion resolves coordinates.
 */
export function PlaceAutocompleteField({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Search address or place…",
  disabled = false,
  className,
  inputClassName,
  proximity,
  limit = 12,
  id,
  name,
  onFocus,
  onBlur,
}: PlaceAutocompleteFieldProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [recents, setRecents] = useState<RecentPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [searched, setSearched] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef(createSearchSessionToken());
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Primitive deps — avoid re-search when parents pass a fresh proximity array each render.
  const proximityLng = proximity?.[0];
  const proximityLat = proximity?.[1];
  const creditBlocked = useMapCreditStore((s) => s.lastMeta?.blocked ?? false);
  const creditBlockedRef = useRef(creditBlocked);
  useEffect(() => {
    creditBlockedRef.current = creditBlocked;
  }, [creditBlocked]);

  const showRecentsPanel = open && value.trim().length < 2 && recents.length > 0;

  const loadRecents = useCallback(() => {
    setRecents(getLocalRecentPlaces());
    void fetchRecentPlaces().then((items) => {
      setRecents(items);
    });
  }, []);

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        abortRef.current?.abort();
        abortRef.current = null;
        setSuggestions([]);
        setSearched(false);
        setStatusNote(null);
        setBusy(false);
        return;
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSuggestions([]);
        setOpen(true);
        setSearched(true);
        setBusy(false);
        setStatusNote("You're offline — place search needs a connection.");
        return;
      }

      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      const requestId = ++requestIdRef.current;
      setBusy(true);
      setStatusNote(null);

      let proximityBias: [number, number] | undefined =
        typeof proximityLng === "number" &&
        typeof proximityLat === "number" &&
        Number.isFinite(proximityLng) &&
        Number.isFinite(proximityLat)
          ? [proximityLng, proximityLat]
          : undefined;

      if (!proximityBias) {
        const cached = getCachedSearchProximity();
        if (cached) {
          proximityBias = cached;
        } else {
          warmSearchProximity();
        }
      }

      try {
        const results = await suggestPlaces(trimmed, {
          sessionToken: sessionTokenRef.current,
          proximity: proximityBias,
          limit,
          signal: abort.signal,
        });

        if (requestId !== requestIdRef.current) return;

        // Keep prior suggestions visible until we have a settled non-empty
        // response — only clear to empty after the current query finishes empty.
        if (results.length > 0) {
          setSuggestions(results);
          setStatusNote(null);
        } else {
          setSuggestions([]);
          setStatusNote("No places found — try a fuller address.");
        }
        setOpen(true);
        setSearched(true);
        setBusy(false);

        if (results.length > 0 && creditBlockedRef.current) {
          setStatusNote("Map credits low — some providers may be limited.");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId !== requestIdRef.current) return;
        setBusy(false);
        setSearched(true);
        setStatusNote("Place search failed — try again.");
      }
    },
    [limit, proximityLng, proximityLat],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [value, runSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    setResolving(true);
    setStatusNote(null);
    try {
      const place = await retrievePlace(suggestion);
      sessionTokenRef.current = createSearchSessionToken();
      if (!place) {
        setStatusNote("Couldn't load that place. Pick another suggestion or drop a pin.");
        toast.error("Couldn't load that place. Pick another suggestion.");
        return;
      }
      onChange(place.address || place.name);
      onPlaceSelect(place);
      void rememberRecentPlace({
        name: place.name,
        address: place.address,
        latitude: place.lat,
        longitude: place.lng,
        provider: place.provider,
        provider_place_id: place.placeId,
      });
      setSuggestions([]);
      setOpen(false);
      setSearched(false);
    } finally {
      setResolving(false);
    }
  };

  const handleRecentSelect = (recent: RecentPlace) => {
    void handleSelect(recentToSuggestionLike(recent, sessionTokenRef.current));
  };

  const showPanel =
    open &&
    (busy ||
      resolving ||
      searched ||
      suggestions.length > 0 ||
      (value.trim().length < 2 && recents.length > 0));

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          value={value}
          disabled={disabled || resolving}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            onFocus?.();
            loadRecents();
            setOpen(true);
          }}
          onBlur={() => {
            onBlur?.();
          }}
          className={inputClassName}
        />
        {(busy || resolving) && (
          <Loader2
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin pointer-events-none"
          />
        )}
      </div>

      {statusNote && !showPanel && (
        <p className="mt-1 text-[11px] text-amber-700">{statusNote}</p>
      )}

      {showPanel && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-44 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {showRecentsPanel && (
            <>
              <li className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-50 border-b border-slate-100">
                Recent
              </li>
              {recents.map((r) => (
                <li key={`recent-${r.id ?? `${r.latitude},${r.longitude}`}`}>
                  <button
                    type="button"
                    disabled={resolving}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-60"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleRecentSelect(r);
                    }}
                  >
                    <span className="block text-[13px] font-semibold text-[#0B1215] leading-tight">
                      {r.name}
                    </span>
                    {r.address && r.address !== r.name && (
                      <span className="block text-[11px] text-gray-500 leading-tight mt-0.5 truncate">
                        {r.address}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </>
          )}
          {(busy || resolving) && suggestions.length === 0 && value.trim().length >= 2 && (
            <li className="px-3 py-2 text-[12px] text-slate-400">
              {resolving ? "Loading place…" : "Searching…"}
            </li>
          )}
          {!busy && !resolving && suggestions.length === 0 && searched && value.trim().length >= 2 && (
            <li className="px-3 py-2 text-[12px] text-slate-400">
              {statusNote ?? "No places found — try a fuller address."}
            </li>
          )}
          {statusNote && suggestions.length > 0 && (
            <li className="px-3 py-1.5 text-[10px] text-amber-700 bg-amber-50 border-b border-amber-100">
              {statusNote}
            </li>
          )}
          {value.trim().length >= 2 &&
            suggestions.map((s) => (
              <li key={`${s.provider}-${s.id}`}>
                <button
                  type="button"
                  disabled={resolving}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-60"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void handleSelect(s);
                  }}
                >
                  <span className="block text-[13px] font-semibold text-[#0B1215] leading-tight">
                    {s.name}
                    {(() => {
                      const label = placeAttributionLabel(
                        s.sources,
                        s.provider,
                        s.attributionVisible,
                      );
                      return label ? (
                        <span className="ml-1.5 text-[9px] font-medium text-slate-400">{label}</span>
                      ) : null;
                    })()}
                  </span>
                  {s.placeFormatted && s.placeFormatted !== s.name && (
                    <span className="block text-[11px] text-gray-500 leading-tight mt-0.5 truncate">
                      {s.placeFormatted}
                    </span>
                  )}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
