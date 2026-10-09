"use client";

import { ActiveTrackingProvider } from "./active-tracking-provider";
import { ActiveTrackingBar } from "./ActiveTrackingBar";
import { FieldActivityReporterProvider } from "./field-activity-reporter-provider";

export function AgentTrackingShell({ children }: { children: React.ReactNode }) {
  return (
    <FieldActivityReporterProvider>
      <ActiveTrackingProvider>
        {children}
        <ActiveTrackingBar />
      </ActiveTrackingProvider>
    </FieldActivityReporterProvider>
  );
}
