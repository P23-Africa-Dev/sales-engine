"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { changeSalesEnginePassword, SalesEngineAuthError } from "@/lib/api/sales-engine-native-auth";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getSalesEngineToken } from "@/lib/sales-engine/session";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z
  .object({
    current_password: z.string().min(1, "Enter your current password."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[A-Za-z]/, "Password must contain at least one letter.")
      .regex(/[0-9]/, "Password must contain at least one number."),
    password_confirmation: z.string().min(1, "Password confirmation is required."),
  })
  .refine((values) => values.password === values.password_confirmation, {
    path: ["password_confirmation"],
    message: "Password confirmation does not match.",
  });

type Values = z.infer<typeof schema>;

export default function SetNewPasswordForm() {
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: Values) {
    const token = getSalesEngineToken() ?? getAuthTokenFromDocument();
    if (!token) {
      toast.error("Sign in before changing your password.");
      return;
    }
    setLoading(true);
    try {
      const response = await changeSalesEnginePassword(token, values);
      toast.success(response.message || "Password changed.");
      reset();
    } catch (error) {
      toast.error(error instanceof SalesEngineAuthError ? error.message : "Could not change the password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <Input type="password" placeholder="Current password" autoComplete="current-password" {...register("current_password")} />
        {errors.current_password ? <p className="mt-1 px-1 text-xs text-red-500">{errors.current_password.message}</p> : null}
      </div>
      <div>
        <Input type="password" placeholder="New password" autoComplete="new-password" {...register("password")} />
        {errors.password ? <p className="mt-1 px-1 text-xs text-red-500">{errors.password.message}</p> : null}
      </div>
      <div>
        <Input type="password" placeholder="Confirm new password" autoComplete="new-password" {...register("password_confirmation")} />
        {errors.password_confirmation ? <p className="mt-1 px-1 text-xs text-red-500">{errors.password_confirmation.message}</p> : null}
      </div>
      <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Change password"}</Button>
    </form>
  );
}
