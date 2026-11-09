import { useEffect, useState } from 'react';
import {
  getCountryFallbackViewport,
  resolvePrivacySafeViewport,
  type ResolvedMapViewport,
} from '@/lib/map/default-viewport';
import type { TaskMapFocus } from '@/lib/tasks/map-navigation';

const TASK_FOCUS_ZOOM = 15;

function taskFocusViewport(taskFocus: TaskMapFocus): ResolvedMapViewport {
  return {
    center: [taskFocus.lng, taskFocus.lat],
    zoom: TASK_FOCUS_ZOOM,
    granularity: 'gps',
    countryCode: null,
  };
}

export type InitialMapViewportState = {
  viewport: ResolvedMapViewport | null;
  /** True while waiting for GPS/IP before the map is created. */
  isResolving: boolean;
  /** True when the viewport came from the user's GPS fix. */
  isUserLocation: boolean;
};

export function useInitialMapViewport(options: {
  preferUserLocation: boolean;
  taskFocus?: TaskMapFocus | null;
}): InitialMapViewportState {
  const { preferUserLocation, taskFocus } = options;
  const immediateViewport = taskFocus
    ? taskFocusViewport(taskFocus)
    : preferUserLocation
      ? null
      : getCountryFallbackViewport();
  const resolutionKey = immediateViewport === null ? 'user-location' : null;
  const [resolvedState, setResolvedState] = useState<{
    key: string;
    viewport: ResolvedMapViewport | null;
    isUserLocation: boolean;
  }>({
    key: '',
    viewport: null,
    isUserLocation: false,
  });

  useEffect(() => {
    if (!resolutionKey) {
      return;
    }

    let cancelled = false;

    resolvePrivacySafeViewport({ preferFreshGps: true }).then((resolved) => {
      if (cancelled) {
        return;
      }

      setResolvedState({
        key: resolutionKey,
        viewport: resolved,
        isUserLocation: resolved.granularity === 'gps',
      });
    });

    return () => {
      cancelled = true;
    };
  }, [resolutionKey]);

  const viewport =
    immediateViewport ?? (resolvedState.key === resolutionKey ? resolvedState.viewport : null);
  const isUserLocation =
    immediateViewport === null &&
    resolvedState.key === resolutionKey &&
    resolvedState.isUserLocation;
  const isResolving = preferUserLocation && !taskFocus && viewport === null;

  return { viewport, isResolving, isUserLocation };
}
