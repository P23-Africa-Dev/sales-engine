"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { forgotPassword } from "@/lib/api/auth";
import { ApiRequestError } from "@/lib/api/onboarding";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

type ForgotPasswordFormProps = {
  prefilledEmail?: string;
  portal?: "management" | "agent";
};

export default function ForgotPasswordForm({
  prefilledEmail = "",
  portal = "management",
}: ForgotPasswordFormProps) {
  const normalizedPrefilledEmail = prefilledEmail.trim();
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isValid },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onChange",
    defaultValues: {
      email: normalizedPrefilledEmail,
    },
  });

  const isFilled = isValid;

  async function onSubmit(values: ForgotPasswordFormValues) {
    setGlobalError("");
    setLoading(true);

    try {
      const res = await forgotPassword({
        email: values.email.trim(),
        portal,
      });
      toast.success(res.message || "Check your email for reset instructions.");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.errors?.email) {
          setError("email", { type: "server", message: err.errors.email[0] });
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
      <div className="mb-8">
        <label className="auth-field-label" htmlFor="recovery-email">Email Address <span aria-hidden="true">*</span></label>
        <Input id="recovery-email" type="email" placeholder="Email Address" {...register("email")} />
        {errors.email && (
          <p className="mt-1.5 px-1 text-xs text-red-500">{errors.email.message}</p>
        )}
      </div>

      {globalError && (
        <p className="mb-4 px-1 text-sm text-red-500 text-center">{globalError}</p>
      )}

      <Button type="submit" disabled={!isFilled || loading}>
        {loading ? "Sending..." : "Send Reset Link"}
      </Button>

      <p className="text-center text-xs mt-6 text-[#A9AAAB]">
        Remember your password?{" "}
        <Link
          href={portal === "agent" ? "/agent/login" : "/login"}
          className="font-bold text-[#34373C] cursor-pointer hover:underline"
        >
          Log In.
        </Link>
      </p>
    </form>
  );
}
