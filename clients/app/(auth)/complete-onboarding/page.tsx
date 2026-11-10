"use client";

import SelfServeOnboardingForm from "@/components/forms/self-serve-onboarding-form";
import { Suspense } from "react";

function CompleteOnboardingInner() {
  return <SelfServeOnboardingForm />;
}

export default function CompleteOnboardingPage() {
  return (
    <div className="w-full max-w-115 flex flex-col gap-8 md:mt-0 lg:-mt-12">
      <div className="text-left md:text-center flex flex-col gap-3">
        <h2 className="text-[32px] sm:text-[36px] font-extrabold leading-10 tracking-[0px] text-[#34373C] mb-2.5">
          Complete your workspace setup
        </h2>
        <p className="text-gray-500 text-sm tracking-[0px] leading-5.5 max-w-100 md:mx-auto">
          Set up your company profile to finish self serve onboarding.
        </p>
      </div>

      <Suspense fallback={null}>
        <CompleteOnboardingInner />
      </Suspense>
    </div>
  );
}
