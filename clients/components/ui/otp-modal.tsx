"use client";

import {
  resendEmailOtp,
  verifyEmailOtp,
  type ApiRequestError,
} from "@/lib/api/onboarding";
import { setAuthSession } from "@/lib/auth/session";
import OtpInput from "@/components/ui/otp-input";
import Button from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

const otpSchema = z.object({
  otp_code: z.string().length(6, "Enter a 6-digit verification code."),
});

type OtpFormValues = z.infer<typeof otpSchema>;

type Props = {
  email: string;
  maskedEmail: string;
  onClose: () => void;
};

export default function OtpModal({ email, maskedEmail, onClose }: Props) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState(60);
  const [otpCode, setOtpCode] = useState("");

  const { handleSubmit, setValue, formState: { errors } } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp_code: "" },
  });

  const verifyMutation = useMutation({
    mutationFn: verifyEmailOtp,
    onSuccess: (res) => {
      toast.success(res.message);
      sessionStorage.setItem("onboarding_name", res.data.user.name);
      setAuthSession(res.data.token, res.data.onboarding_completed ?? false);
      router.push(res.data.onboarding_completed ? "/dashboard" : "/complete-onboarding");
    },
    onError: (err: ApiRequestError) => {
      toast.error(err.message);
    },
  });

  const resendMutation = useMutation({
    mutationFn: resendEmailOtp,
    onSuccess: (res) => {
      setTimeLeft(60);
      toast.success(res.message);
    },
    onError: (err: ApiRequestError) => {
      toast.error(err.message);
    },
  });

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formattedTime = format(new Date(timeLeft * 1000), "mm:ss");
  const canResend = timeLeft <= 0 && !resendMutation.isPending;
  const verifyError = verifyMutation.error as ApiRequestError | null;
  const resendError = resendMutation.error as ApiRequestError | null;

  function onSubmit(values: OtpFormValues) {
    verifyMutation.mutate({ email, otp_code: values.otp_code });
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      {/* Card */}
      <div className="relative w-full max-w-105 mx-4 bg-white rounded-3xl px-8 py-10 shadow-xl flex flex-col items-center gap-6">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-5 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center flex flex-col gap-1">
          <h3 className="text-[22px] font-extrabold text-[#34373C]">Account Security Checks</h3>
          <p className="text-gray-400 text-sm">Build trust and prevent spam.</p>
          <p className="text-[#34373C] text-sm font-medium mt-1">
            &ldquo;We&apos;ve sent a 6-digit code to&rdquo;
          </p>
          <p className="text-sm font-semibold text-dash-teal">{maskedEmail}</p>
        </div>

        <form
          className="w-full flex flex-col items-center gap-4"
          onSubmit={handleSubmit(onSubmit)}
        >
          <p className="text-xs text-gray-400">Enter the 6-digit OTP here!</p>

          <OtpInput
            value={otpCode}
            onChange={(value) => {
              setOtpCode(value);
              setValue("otp_code", value, { shouldValidate: true });
            }}
          />

          {errors.otp_code && (
            <p className="text-xs text-red-500">{errors.otp_code.message}</p>
          )}
          {verifyError && (
            <p className="text-xs text-red-500">{verifyError.message}</p>
          )}

          <p className="text-xs text-gray-400">{formattedTime} mins</p>

          <div className="flex flex-col gap-3 w-full">
            <Button type="submit" disabled={verifyMutation.isPending}>
              {verifyMutation.isPending ? "Verifying..." : "Verify"}
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={!canResend}
              onClick={() => resendMutation.mutate({ email })}
            >
              {resendMutation.isPending ? "Sending..." : "Resend OTP"}
            </Button>
            {resendError && (
              <p className="text-xs text-red-500 text-center">{resendError.message}</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
