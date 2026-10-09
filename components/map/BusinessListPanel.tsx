'use client';

import { useEffect, useRef, type ReactNode, type UIEvent } from 'react';
import { Building2, Clock, MapPin, Phone } from 'lucide-react';
import type { SavedLocation } from '@/lib/api/saved-locations';
import { getSavedLocationType } from '@/lib/map/location-types';
import type { LocationContext } from '@/lib/map/location-search';
import {
  BBOX_TOO_LARGE_MSG,
  isBboxTooLarge,
  type PoiResult,
} from '@/lib/map/overpass-search';

type Props = {
  activeLocation: LocationContext | null;
  pois: PoiResult[];
  poiBusy: boolean;
  poiZoomTooLow?: boolean;
  savedLocations: SavedLocation[];
  savedLocationsLoading: boolean;
  savedLocationsTotal?: number | null;
  hasNextSavedPage?: boolean;
  isFetchingNextSavedPage?: boolean;
  onLoadMoreSaved?: () => void;
  /** Override empty-state copy for the pinned list (e.g. agent "your pins"). */
  pinnedEmptyMessage?: string;
  pinnedEmptyHint?: string;
  pinnedListHint?: string;
  /** Override the pinned list heading (default: Pinned Locations / with total). */
  pinnedTitleOverride?: string | null;
  onPoiClick: (p: PoiResult) => void;
  onSavedClick: (b: SavedLocation) => void;
};

export function BusinessListPanel({
  activeLocation,
  pois = [],
  poiBusy = false,
  poiZoomTooLow = false,
  savedLocations = [],
  savedLocationsLoading = false,
  savedLocationsTotal = null,
  hasNextSavedPage = false,
  isFetchingNextSavedPage = false,
  onLoadMoreSaved,
  pinnedEmptyMessage = 'No pinned locations yet',
  pinnedEmptyHint = 'Use Location Pinning on the map to save a place',
  pinnedListHint = 'Scroll for more · search to find any pin',
  pinnedTitleOverride = null,
  onPoiClick,
  onSavedClick,
}: Props) {
  const isSearching = activeLocation !== null;
  const showPoiList =
    isSearching || pois.length > 0 || poiBusy || poiZoomTooLow;
  const bboxTooLarge =
    isSearching && activeLocation.bbox ? isBboxTooLarge(activeLocation.bbox) : false;
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!onLoadMoreSaved || !hasNextSavedPage || isFetchingNextSavedPage || showPoiList) {
      return;
    }
    const el = event.currentTarget;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 120) {
      onLoadMoreSaved();
    }
  };

  // If the list is shorter than the viewport, still pull the next page.
  useEffect(() => {
    if (showPoiList || !onLoadMoreSaved || !hasNextSavedPage || isFetchingNextSavedPage) {
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 8) {
      onLoadMoreSaved();
    }
  }, [
    showPoiList,
    savedLocations.length,
    hasNextSavedPage,
    isFetchingNextSavedPage,
    onLoadMoreSaved,
  ]);

  const pinnedTitle =
    pinnedTitleOverride ??
    (savedLocationsTotal != null && savedLocationsTotal > 0
      ? `Pinned Locations (${savedLocationsTotal})`
      : 'Pinned Locations');

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden">
      <div className="px-5 pt-3 pb-2 shrink-0">
        {showPoiList ? (
          <div className="flex items-center gap-2 min-w-0">
            <MapPin size={13} className="text-dash-teal shrink-0" />
            <p className="text-[13px] font-bold text-dash-dark truncate flex-1">
              {isSearching ? activeLocation.name : 'Businesses in view'}
            </p>
            {!poiBusy && !bboxTooLarge && !poiZoomTooLow && pois.length > 0 && (
              <span className="shrink-0 text-[10px] font-bold text-white bg-dash-teal px-2 py-0.5 rounded-full">
                {pois.length}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[13px] font-bold text-dash-dark">{pinnedTitle}</p>
        )}
        {showPoiList && !poiBusy && !bboxTooLarge && !poiZoomTooLow && (
          <p className="text-[11px] text-slate-400 mt-0.5 pl-5">
            {isSearching ? 'Businesses in this area' : 'Pan and zoom the map to discover more'}
          </p>
        )}
        {!showPoiList && savedLocations.length > 0 && (
          <p className="text-[11px] text-slate-400 mt-0.5">
            {pinnedListHint}
          </p>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4 space-y-1 min-h-0"
      >
        {showPoiList ? (
          bboxTooLarge ? (
            <Empty
              icon={<MapPin size={26} className="text-slate-300" />}
              message={BBOX_TOO_LARGE_MSG}
            />
          ) : poiZoomTooLow ? (
            <Empty
              icon={<Building2 size={26} className="text-slate-300" />}
              message="Zoom in to discover businesses"
              hint="Pan the map and zoom to level 12 or higher"
            />
          ) : poiBusy ? (
            <Spinner message="Finding businesses…" />
          ) : pois.length === 0 ? (
            <Empty
              icon={<Building2 size={26} className="text-slate-300" />}
              message="No businesses found in this view"
              hint="Try panning to a busier area or zooming in further"
            />
          ) : (
            pois.map((poi) => (
              <PoiCard key={poi.id} poi={poi} onClick={() => onPoiClick(poi)} />
            ))
          )
        ) : savedLocationsLoading ? (
          <Spinner message="Loading…" />
        ) : savedLocations.length === 0 ? (
          <Empty
            icon={<MapPin size={26} className="text-slate-300" />}
            message={pinnedEmptyMessage}
            hint={pinnedEmptyHint}
          />
        ) : (
          <>
            {savedLocations.map((b) => (
              <SavedCard key={b.id} business={b} onClick={() => onSavedClick(b)} />
            ))}
            {isFetchingNextSavedPage && (
              <div className="py-3 flex justify-center">
                <span className="w-4 h-4 border-2 border-gray-200 border-t-dash-teal rounded-full animate-spin" />
              </div>
            )}
            {!hasNextSavedPage && savedLocations.length > 0 && (
              <p className="text-center text-[10px] text-slate-300 py-2">
                All pinned locations loaded
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PoiCard({ poi, onClick }: { poi: PoiResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl px-3 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-xl shrink-0 mt-0.5 flex items-center justify-center"
          style={{ backgroundColor: `${poi.categoryColor}1a` }}
        >
          <div
            className="w-3.5 h-3.5 rounded-full"
            style={{ backgroundColor: poi.categoryColor }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-dash-dark leading-tight truncate group-hover:text-dash-teal transition-colors">
            {poi.name}
          </p>
          <p className="text-[11px] font-medium mt-0.5" style={{ color: poi.categoryColor }}>
            {poi.categoryLabel}
          </p>
          {poi.address && (
            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{poi.address}</p>
          )}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {poi.phone && (
              <span className="flex items-center gap-1">
                <Phone size={9} className="text-slate-400" />
                <span className="text-[10px] text-slate-400">{poi.phone}</span>
              </span>
            )}
            {poi.openingHours && (
              <span className="flex items-center gap-1">
                <Clock size={9} className="text-slate-400" />
                <span className="text-[10px] text-slate-400 truncate max-w-30">
                  {poi.openingHours}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function SavedCard({
  business,
  onClick,
}: {
  business: SavedLocation;
  onClick: () => void;
}) {
  const typeOpt = getSavedLocationType(business.type);
  const Icon = typeOpt.icon;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl px-3 py-3 hover:bg-slate-50 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${typeOpt.color}1a` }}
        >
          <Icon size={15} style={{ color: typeOpt.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-dash-dark leading-tight truncate group-hover:text-dash-teal transition-colors">
            {business.name}
            {business.can_manage && (
              <span className="ml-1.5 text-[10px] font-medium text-dash-teal">Your pin</span>
            )}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">{typeOpt.label}</p>
          {business.address && (
            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{business.address}</p>
          )}
        </div>
      </div>
    </button>
  );
}

function Spinner({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <span className="w-5 h-5 border-2 border-gray-200 border-t-dash-teal rounded-full animate-spin" />
      <p className="text-[12px] text-gray-400">{message}</p>
    </div>
  );
}

function Empty({
  icon,
  message,
  hint,
}: {
  icon: ReactNode;
  message: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
      {icon}
      <p className="text-[12px] font-medium text-slate-400">{message}</p>
      {hint && <p className="text-[11px] text-slate-300 leading-snug">{hint}</p>}
    </div>
  );
}
