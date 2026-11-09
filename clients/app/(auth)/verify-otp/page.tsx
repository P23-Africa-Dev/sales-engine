import { Suspense } from "react";
import OtpForm from "@/components/forms/otp-form";

export default function VerifyOtpPage() {
  return (
    <div className="w-full max-w-[460px] flex flex-col gap-8">
      <div className="text-left mx-[27px] md:mx-0 md:text-center flex flex-col gap-1">
        <h2 className="text-[32px] font-extrabold leading-[100%] tracking-[0px] text-gray-900 md:mb-2.5 mb-[18px]">
          Account Security Checks
        </h2>
        <p className="text-gray-500 text-[15px] font-light tracking-[0px] leading-[18px]">
          Build trust and prevent spam.
        </p>
        <p className="text-gray-900 text-[15px] font-medium leading-[18px]">
          {"\u201C"}We{"\u2019"}ve sent a 6-digit code to your email.{"\u201D"}
        </p>
      </div>

      <Suspense>
        <OtpForm />
      </Suspense>
    </div>
  );
}
