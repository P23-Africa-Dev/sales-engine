"use client";

import React, { createContext, useContext, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useTrackingStore } from "@/store/tracking";
import * as locationBuffer from "@/lib/tracking/location-buffer";

interface ActiveTrackingContextValue {
  startTracking: (
    taskId: number,
    companyId: number | string,
    token: string,
    callbacks?: {
      onArrived?: () => void;
      onError?: (err: unknown) => void;
      onStopped?: (message: string) => void;
    }
  ) => void;
  stopTracking: () => void;
  isTracking: boolean;
  activeTaskId: number | null;
}

const ActiveTrackingContext = createContext<ActiveTrackingContextValue>({
  startTracking: () => {},
  stopTracking: () => {},
  isTracking: false,
  activeTaskId: null,
});

export function useActiveTracking() {
  return useContext(ActiveTrackingContext);
}

export function ActiveTrackingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const setActiveTrackingTask = useTrackingStore((s) => s.setActiveTrackingTask);
  const activeTrackingTaskId = useTrackingStore((s) => s.activeTrackingTaskId);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startTracking = useCallback(
    (
      taskId: number,
      companyId: number | string,
      token: string,
      callbacks?: {
        onArrived?: () => void;
        onError?: (err: unknown) => void;
        onStopped?: (message: string) => void;
      }
    ) => {
      // Stop any existing session before starting a new one
      if (locationBuffer.isActive()) {
        locationBuffer.stop();
      }

      // Throttle repeat error toasts so a flaky network doesn't spam the UI.
      let lastErrorToastAt = 0;

      locationBuffer.start(taskId, companyId, token, {
        onArrived: callbacks?.onArrived,
        onError:
          callbacks?.onError ??
          ((err) => {
            const now = Date.now();
            if (now - lastErrorToastAt < 60_000) return;
            lastErrorToastAt = now;
            const message =
              (err as { message?: string })?.message ??
              "Location update failed — retrying in the background.";
            toast.error("Tracking issue", { description: message });
          }),
        onStopped:
          callbacks?.onStopped ??
          ((message) => {
            setActiveTrackingTask(null);
            toast.error("Tracking stopped", { description: message });
          }),
      });

      setActiveTrackingTask(taskId);

      cleanupRef.current = () => {
        locationBuffer.stop();
        setActiveTrackingTask(null);
      };
    },
    [setActiveTrackingTask]
  );

  const stopTracking = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    // Also tear down directly in case tracking was activated outside of
    // startTracking (e.g. the store was hydrated/set by another flow), so the
    // Cancel button always works regardless of how tracking began.
    if (locationBuffer.isActive()) {
      locationBuffer.stop();
    }
    setActiveTrackingTask(null);
  }, [setActiveTrackingTask]);

  // Clean up on unmount (e.g., logout / layout unmount)
  React.useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return (
    <ActiveTrackingContext.Provider
      value={{
        startTracking,
        stopTracking,
        isTracking: activeTrackingTaskId !== null,
        activeTaskId: activeTrackingTaskId,
      }}
    >
      {children}
    </ActiveTrackingContext.Provider>
  );
}
