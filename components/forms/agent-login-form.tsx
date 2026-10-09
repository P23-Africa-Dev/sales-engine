"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { loginAgent } from "@/lib/api/auth";
import { ApiRequestError } from "@/lib/api/onboarding";
import { getAccountStatusMessage } from "@/lib/auth/account-status";
import { clearAuthSession, getAuthTokenFromDocument, setAuthSession, setCompanyId } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const loginSchema = z.object({
  terms: z.boolean().refine((val) => val === true, "You must agree to the terms."),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
  remember: z.boolean().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function AgentLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const clearUser = useAuthStore((s) => s.clearUser);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [showPassword, setShowPassword] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, submitCount },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      terms: false,
      email: "",
      password: "",
      remember: false,
    },
  });

  const terms = watch("terms");
  const email = watch("email");
  const password = watch("password");
  const isFilled = email.trim() !== "" && password.trim() !== "";
  const showResetSuccess = searchParams.get("reset") === "success";
  const accountStatusMessage = getAccountStatusMessage(searchParams);

  useEffect(() => {
    if (!hasHydrated) return;

    const token = getAuthTokenFromDocument();
    if (!token) {
      clearAuthSession();
      if (user) {
        clearUser();
      }
      return;
    }
  }, [hasHydrated, user, clearUser]);

  async function onSubmit(values: LoginFormValues) {
    setGlobalError("");
    setLoading(true);

    try {
      const res = await loginAgent({ email: values.email, password: values.password });
      const token = res.data.token;
      const profile = res.data.user;

      setAuthSession(token, Boolean(profile.onboarding_completed));

      if (profile.active_company?.id) {
        setCompanyId(profile.active_company.id);
      }
      setUser({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        avatar: profile.avatar,
        access_role: res.data.access_role,
        active_company: profile.active_company,
      });

      toast.success(res.message);
      router.push("/agent/dashboard");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.errors) {
          if (err.errors.email) setError("email", { type: "server", message: err.errors.email[0] });
          if (err.errors.password) setError("password", { type: "server", message: err.errors.password[0] });
        } else {
          setGlobalError(err.message);
        }
        toast.error(err.message);
      } else {
        const msg = "An unexpected error occurred. Please try again.";
        setGlobalError(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col" noValidate>
      <style>{`
        @keyframes glitch-bounce {
          0%   { transform: translateX(0) scale(1); }
          10%  { transform: translateX(-5px) scale(1.06); }
          20%  { transform: translateX(5px) scale(0.94); }
          30%  { transform: translateX(-4px) scale(1.04); }
          40%  { transform: translateX(4px) scale(0.97); }
          50%  { transform: translateX(-3px) scale(1.02); }
          60%  { transform: translateX(3px) scale(0.98); }
          70%  { transform: translateX(-2px) scale(1.01); }
          80%  { transform: translateX(2px) scale(0.99); }
          90%  { transform: translateX(-1px) scale(1.005); }
          100% { transform: translateX(0) scale(1); }
        }
        .glitch-bounce { animation: glitch-bounce 0.55s ease-out; }
      `}</style>

      <div
        key={errors.terms ? submitCount : 0}
        className={`flex items-start gap-4 mb-9 px-2 md:px-7 ${errors.terms ? "glitch-bounce" : ""}`}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            type="checkbox"
            id="terms"
            {...register("terms")}
            className={`peer w-5 h-5 shrink-0 appearance-none rounded-md border-[1.5px] bg-white checked:!bg-[#143028] checked:!border-[#143028] cursor-pointer transition-all ${
              errors.terms ? "border-red-400" : "border-[#143028]/30 hover:border-[#143028]"
            }`}
          />
          <svg
            className="absolute text-[#d6f25c] pointer-events-none opacity-0 peer-checked:opacity-100 w-3.5 h-3.5 transition-opacity"
            viewBox="0 0 10 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex flex-col">
          <label
            htmlFor="terms"
            className="text-[13px] md:text-sm text-[#A9AAAB] leading-5.5 cursor-pointer"
          >
            By using Factory 23, you agree to our{" "}
            <Link
              href="/files/Factory23 Terms of Service.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#6FA8A6] font-bold underline decoration-[#6FA8A6] underline-offset-2 hover:text-[#5e9795] transition-colors"
            >
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link
              href="/files/Factory23 Privacy Policy.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#6FA8A6] font-bold underline decoration-[#6FA8A6] underline-offset-2 hover:text-[#5e9795] transition-colors"
            >
              Privacy Policy
            </Link>
            .
          </label>
          {errors.terms && (
            <p className="mt-1 px-1 text-[11px] font-medium text-red-500">
              Accept the T&amp;C
            </p>
          )}
        </div>
      </div>

      <div className="mb-6">
        <Input
          type="email"
          placeholder="Email"
          {...register("email")}
        />
        {errors.email && (
          <p className="mt-1.5 px-1 text-xs text-red-500">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="relative mb-6">
        <Input
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          className="w-full pr-12"
          {...register("password")}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors focus:outline-none"
          tabIndex={-1}
        >
          {showPassword ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10a13.35 13.35 0 0 0 9 4 13.35 13.35 0 0 0 9-4" />
              <path d="M12 14v4" />
              <path d="M8.5 13.5l-2 3" />
              <path d="M15.5 13.5l2 3" />
            </svg>
          )}
        </button>
        {errors.password && (
          <p className="mt-1.5 px-1 text-xs text-red-500">
            {errors.password.message}
          </p>
        )}
      </div>

      {accountStatusMessage && (
        <p className="mb-4 px-1 text-sm text-amber-700 text-center">
          {accountStatusMessage}
        </p>
      )}

      {globalError && (
        <p className="mb-4 px-1 text-sm text-red-500 text-center">
          {globalError}
        </p>
      )}

      {showResetSuccess && (
        <p className="mb-4 px-1 text-sm text-emerald-600 text-center">
          Password reset successfully. Please login with your new password.
        </p>
      )}

      <div className="flex items-center justify-between mb-16 px-2 md:px-7">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              id="remember"
              {...register("remember")}
              className="peer w-5 h-5 shrink-0 appearance-none rounded-md border-[1.5px] border-[#143028]/30 hover:border-[#143028] bg-white checked:!bg-[#143028] checked:!border-[#143028] cursor-pointer transition-all"
            />
            <svg
              className="absolute text-[#d6f25c] pointer-events-none opacity-0 peer-checked:opacity-100 w-3.5 h-3.5 transition-opacity"
              viewBox="0 0 10 8"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 4L3.5 6.5L9 1"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <label htmlFor="remember" className="text-sm text-[#A9AAAB] cursor-pointer">
            Remember Me
          </label>
        </div>
        <Link
          href={{
            pathname: "/forgot-password",
            query: {
              email: email.trim(),
              portal: "agent",
            },
          }}
          className="text-sm font-bold text-[#34373C] hover:underline"
        >
          Forgot Password?
        </Link>
      </div>

      <Button type="submit" disabled={!isFilled || loading}>
        {loading ? "Logging in…" : "Log In"}
      </Button>
    </form>
  );
}
