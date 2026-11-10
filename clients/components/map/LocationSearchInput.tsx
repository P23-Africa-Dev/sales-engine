'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Search, X, Loader2 } from 'lucide-react';
import {
  createSearchSessionToken,
  retrievePlace,
  suggestPlaces,
  type PlaceSuggestion,
} from '@/lib/utils/place-search';
import { placeAttributionLabel } from '@/lib/utils/place-attribution';
import { getCachedSearchProximity, warmSearchProximity } from '@/lib/utils/search-proximity';
import {
  fetchRecentPlaces,
  getLocalRecentPlaces,
  recentToSuggestionLike,
  rememberRecentPlace,
  type RecentPlace,
} from '@/lib/map/recent-places';
import type { LocationContext } from '@/lib/map/location-search';
import { inferIsBusiness } from '@/lib/map/poi-display';
import type { SavedLocation } from '@/lib/api/saved-locations';
import { getSavedLocationLabel } from '@/lib/map/location-types';

const DEBOUNCE_MS = 300;

type Props = {
  activeLocation: LocationContext | null;
  onLocationSelect: (ctx: LocationContext | null) => void;
  className?: string;
  /** Optional pinned-location suggestions (server search from parent). */
  savedSuggestions?: SavedLocation[];
  onSavedSelect?: (location: SavedLocation) => void;
  /** Fires on each query change (debounced by parent if needed). */
  onQueryChange?: (query: string) => void;
};

export function LocationSearchInput({
  activeLocation,
  onLocationSelect,
  className,
  savedSuggestions = [],
  onSavedSelect,
  onQueryChange,
}: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [recents, setRecents] = useState<RecentPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  // One Search Box session per suggest→retrieve cycle (Mapbox billing model).
  const sessionTokenRef = useRef<string>(createSearchSessionToken());

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      abortRef.current?.abort();
      abortRef.current = null;
      setSuggestions([]);
      setOpen(false);
      setBusy(false);
      return;
    }

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const requestId = ++requestIdRef.current;

    setBusy(true);
    try {
      const cached = getCachedSearchProximity();
      const proximity: [number, number] | undefined = cached ?? undefined;
      if (!proximity) warmSearchProximity();

      const results = await suggestPlaces(q, {
        sessionToken: sessionTokenRef.current,
        proximity,
        limit: 12,
        signal: abort.signal,
      });
      if (requestId !== requestIdRef.current) return;
      if (results.length > 0) {
        setSuggestions(results);
      } else {
        setSuggestions([]);
      }
      setOpen(true);
      setBusy(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId !== requestIdRef.current) return;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    onQueryChange?.(query);
  }, [query, onQueryChange]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSelect(suggestion: PlaceSuggestion) {
    setResolving(true);
    const place = await retrievePlace(suggestion);
    setResolving(false);
    // Retrieval ends the search session; start a fresh one for the next search.
    sessionTokenRef.current = createSearchSessionToken();

    if (!place) return;

    void rememberRecentPlace({
      name: place.name,
      address: place.address,
      latitude: place.lat,
      longitude: place.lng,
      provider: place.provider,
      provider_place_id: place.placeId,
    });

    onLocationSelect({
      name: place.name,
      center: [place.lng, place.lat],
      bbox: place.bbox,
      radiusKm: 5,
      placeId: suggestion.id,
      address: place.address,
      category: suggestion.category,
      isBusiness: inferIsBusiness(suggestion),
    });
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }

  function handleRecentSelect(recent: RecentPlace) {
    void handleSelect(recentToSuggestionLike(recent, sessionTokenRef.current));
  }

  function handleSavedSelect(location: SavedLocation) {
    onSavedSelect?.(location);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }

  function handleClear() {
    onLocationSelect(null);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }

  const showRecents = open && query.trim().length < 2 && recents.length > 0;
  const showDropdown =
    open &&
    (busy ||
      suggestions.length > 0 ||
      savedSuggestions.length > 0 ||
      query.trim().length >= 2 ||
      showRecents);

  return (
    <div ref={containerRef} className={className}>
      {activeLocation ? (
        <div className="flex items-center gap-2 bg-white rounded-full px-4 py-3 shadow-2xl shadow-black/10 border border-slate-100">
          <MapPin size={15} className="text-dash-teal shrink-0" />
          <span className="text-[13px] font-semibold text-dash-dark truncate flex-1">
            {activeLocation.name}
          </span>
          <button
            onClick={handleClear}
            className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"
            aria-label="Clear location"
          >
            <X size={11} className="text-slate-500" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={15} strokeWidth={2} />
            <input
              type="text"
              placeholder="Search places…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                setRecents(getLocalRecentPlaces());
                void fetchRecentPlaces().then(setRecents);
                setOpen(true);
              }}
              className="w-full bg-white rounded-full py-3 pl-10 pr-10 text-[13px] shadow-2xl shadow-black/10 outline-none font-medium text-dash-dark placeholder:text-gray-400 border border-slate-100"
            />
            {busy || resolving ? (
              <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
            ) : query.length > 0 ? (
              <button
                onClick={() => { setQuery(''); setSuggestions([]); setOpen(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <X size={10} className="text-slate-500" />
              </button>
            ) : null}
          </div>

          {showDropdown && (
            <div className="absolute top-full mt-2 left-0 right-0 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-2 py-2 shadow-xl max-h-[280px] overflow-y-auto z-30">
              {showRecents && (
                <div className="mb-1">
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Recent
                  </p>
                  {recents.map((r) => (
                    <button
                      key={`recent-${r.id ?? `${r.latitude},${r.longitude}`}`}
                      type="button"
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                      onClick={() => handleRecentSelect(r)}
                    >
                      <p className="text-[13px] font-semibold text-dash-dark leading-tight">{r.name}</p>
                      {r.address && r.address !== r.name && (
                        <p className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate">{r.address}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {savedSuggestions.length > 0 && query.trim().length >= 2 && (
                <div className="mb-1">
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Pinned locations
                  </p>
                  {savedSuggestions.map((loc) => (
                    <button
                      key={`saved-${loc.id}`}
                      type="button"
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                      onClick={() => handleSavedSelect(loc)}
                    >
                      <p className="text-[13px] font-semibold text-dash-dark leading-tight">
                        {loc.name}
                        <span className="ml-2 text-[10px] font-medium text-dash-teal">
                          {loc.can_manage ? 'Your pin' : 'Pinned'}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate">
                        {getSavedLocationLabel(loc.type)}
                        {loc.address ? ` · ${loc.address}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {busy && suggestions.length === 0 && savedSuggestions.length === 0 && query.trim().length >= 2 && (
                <p className="px-3 py-2 text-[12px] text-slate-400">Searching…</p>
              )}
              {!busy &&
                suggestions.length === 0 &&
                savedSuggestions.length === 0 &&
                query.trim().length >= 2 && (
                <p className="px-3 py-2 text-[12px] text-slate-400">No places found.</p>
              )}
              {suggestions.length > 0 && query.trim().length >= 2 && (
                <>
                  {savedSuggestions.length > 0 && (
                    <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Places
                    </p>
                  )}
                  {suggestions.map((s) => (
                    <button
                      key={`${s.provider}-${s.id}`}
                      disabled={resolving}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60"
                      onClick={() => handleSelect(s)}
                    >
                      <p className="text-[13px] font-semibold text-dash-dark leading-tight">
                        {s.name}
                        {s.category && (
                          <span className="ml-2 text-[10px] font-medium text-dash-teal capitalize">
                            {s.category.replace(/_/g, ' ')}
                          </span>
                        )}
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
                      </p>
                      {s.placeFormatted && s.placeFormatted !== s.name && (
                        <p className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate">{s.placeFormatted}</p>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
