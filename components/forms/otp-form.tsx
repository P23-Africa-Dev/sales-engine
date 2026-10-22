"use client";

import {
  fetchSalesEngineAccount,
  resendSalesEngineOtp,
  SalesEngineAuthError,
  verifySalesEngineEmail,
} from "@/lib/api/sales-engine-native-auth";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import OtpInput from "@/components/ui/otp-input";
import Button from "@/components/ui/button";

const otpSchema = z.object({
  otp_code: z.string().length(6, "Enter a 6-digit verification code."),
});

type OtpFormValues = z.infer<typeof otpSchema>;

export default function OtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [timeLeft, setTimeLeft] = useState(60);
  const [otpCode, setOtpCode] = useState("");

  const {
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp_code: "" },
  });

  const otpCodeValue = useWatch({ control, name: "otp_code" });
  const isFilled = otpCodeValue?.length === 6;

  const verifyMutation = useMutation({
    mutationFn: (values: OtpFormValues) =>
      verifySalesEngineEmail({ email, code: values.otp_code }),
    onSuccess: async () => {
      const token = getAuthTokenFromDocument();
      if (!token) {
        router.push("/login");
        return;
      }
      try {
        const account = await fetchSalesEngineAccount(token);
        router.push(account.onboarding_completed ? "/sales-engine" : "/complete-onboarding");
      } catch {
        router.push("/sales-engine");
      }
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => resendSalesEngineOtp(email),
    onSuccess: () => {
      setTimeLeft(60);
    },
  });

  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formattedTime = format(new Date(timeLeft * 1000), "mm:ss");

  const onSubmit = (values: OtpFormValues) => {
    verifyMutation.mutate(values);
  };

  const canResend = timeLeft <= 0 && !resendMutation.isPending;
  const verifyError = verifyMutation.error as SalesEngineAuthError | null;
  const resendError = resendMutation.error as SalesEngineAuthError | null;

  return (
    <form className="flex flex-col items-center" onSubmit={handleSubmit(onSubmit)}>
      <p className="text-xs text-gray-400 mb-[9px]">Enter the 6-digit OTP here!</p>

      <OtpInput
        value={otpCode}
        onChange={(value) => {
          setOtpCode(value);
          setValue("otp_code", value, { shouldValidate: true });
        }}
      />

      {errors.otp_code ? (
        <p className="text-xs text-red-500 mt-3">{errors.otp_code.message}</p>
      ) : null}
      {verifyError ? (
        <p className="text-xs text-red-500 mt-3">{verifyError.message}</p>
      ) : null}
      {!email ? (
        <p className="text-xs text-red-500 mt-3">
          Missing email context. Please restart registration.
        </p>
      ) : null}

      <p className="text-xs text-gray-400 mt-[15px] mb-10">
        {formattedTime} mins
      </p>

      <div className="flex flex-col md:gap-3 gap-3 mt-2 w-full px-[27px] md:px-0">
        <Button type="submit" disabled={!isFilled || verifyMutation.isPending || !email}>
          {verifyMutation.isPending ? "Verifying..." : "Verify"}
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={!canResend || !email}
          onClick={() => resendMutation.mutate()}
        >
          {resendMutation.isPending ? "Sending..." : "Resend OTP"}
        </Button>
        {resendError ? (
          <p className="text-xs text-red-500 text-center">{resendError.message}</p>
        ) : null}

        <p className="text-center text-xs text-[#A9AAAB]">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-[#34373C] cursor-pointer hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}
