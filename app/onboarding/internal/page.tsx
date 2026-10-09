import { Suspense } from "react";
import InternalOnboardingClient from "./internal-onboarding-client";

export default function InternalOnboardingPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-gray-500 text-center">Loading invitation...</p>
      }
    >
      <InternalOnboardingClient />
    </Suspense>
  );
}
