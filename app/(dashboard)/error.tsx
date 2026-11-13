"use client";

import { PageRecovery } from "@/components/ui/safe-boundary";

/**
 * Catches anything a section didn't, inside the dashboard layout: the navigation stays
 * and the page refreshes itself before asking the user to do anything.
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <PageRecovery error={error} retry={unstable_retry} />;
}
