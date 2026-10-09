"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { resetPassword, validateResetPasswordToken } from "@/lib/api/auth";
import { ApiRequestError } from "@/lib/api/onboarding";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const resetPasswordSchema = z
    .object({
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

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

type ResetPasswordFormProps = {
    token: string;
    email: string;
    portal: "management" | "agent";
};

export default function ResetPasswordForm({ token, email, portal }: ResetPasswordFormProps) {
    const router = useRouter();
    const normalizedEmail = email.trim().toLowerCase();
    const loginPath = portal === "agent" ? "/agent/login" : "/login";

    const [globalError, setGlobalError] = useState("");
    const [isValidatingToken, setIsValidatingToken] = useState(true);
    const [isTokenValid, setIsTokenValid] = useState(false);
    const [loading, setLoading] = useState(false);

    const {
        register,
        handleSubmit,
        setError,
        formState: { errors, isValid },
    } = useForm<ResetPasswordFormValues>({
        resolver: zodResolver(resetPasswordSchema),
        mode: "onChange",
        defaultValues: {
            password: "",
            password_confirmation: "",
        },
    });

    useEffect(() => {
        let mounted = true;

        async function validateToken() {
            if (!normalizedEmail) {
                if (mounted) {
                    setGlobalError("The reset link is incomplete. Please request a new password reset link.");
                    setIsTokenValid(false);
                    setIsValidatingToken(false);
                }
                return;
            }

            setIsValidatingToken(true);
            setGlobalError("");

            try {
                await validateResetPasswordToken(token, { email: normalizedEmail, portal });
                if (mounted) {
                    setIsTokenValid(true);
                }
            } catch (err) {
                if (mounted) {
                    setIsTokenValid(false);
                    if (err instanceof ApiRequestError) {
                        setGlobalError(err.message || "This reset link is invalid or has expired.");
                    } else {
                        setGlobalError("Unable to validate reset link. Please try again.");
                    }
                }
            } finally {
                if (mounted) {
                    setIsValidatingToken(false);
                }
            }
        }

        validateToken();

        return () => {
            mounted = false;
        };
    }, [normalizedEmail, portal, token]);

    const canSubmit = useMemo(() => isValid && isTokenValid && !loading, [isValid, isTokenValid, loading]);

    async function onSubmit(values: ResetPasswordFormValues) {
        setGlobalError("");
        setLoading(true);

        try {
            const response = await resetPassword({
                email: normalizedEmail,
                token,
                password: values.password,
                password_confirmation: values.password_confirmation,
                portal,
            });

            toast.success(response.message || "Password reset successfully.");
            router.push(`${response.data.redirect_path || loginPath}?reset=success`);
        } catch (err) {
            if (err instanceof ApiRequestError) {
                if (err.errors?.password) {
                    setError("password", { type: "server", message: err.errors.password[0] });
                }
                if (err.errors?.password_confirmation) {
                    setError("password_confirmation", {
                        type: "server",
                        message: err.errors.password_confirmation[0],
                    });
                }
                if (err.errors?.token) {
                    setGlobalError(err.errors.token[0]);
                    setIsTokenValid(false);
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
            {isValidatingToken && (
                <p className="mb-5 px-1 text-sm text-[#6B7280] text-center">Validating reset link...</p>
            )}

            <div className="mb-6">
                <Input
                    type="password"
                    placeholder="New Password"
                    autoComplete="new-password"
                    {...register("password")}
                />
                {errors.password && <p className="mt-1.5 px-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <div className="mb-8">
                <Input
                    type="password"
                    placeholder="Confirm Password"
                    autoComplete="new-password"
                    {...register("password_confirmation")}
                />
                {errors.password_confirmation && (
                    <p className="mt-1.5 px-1 text-xs text-red-500">{errors.password_confirmation.message}</p>
                )}
            </div>

            {globalError && <p className="mb-4 px-1 text-sm text-red-500 text-center">{globalError}</p>}

            <Button type="submit" disabled={!canSubmit || isValidatingToken}>
                {loading ? "Resetting..." : "Reset Password"}
            </Button>

            <p className="text-center text-xs mt-6 text-[#A9AAAB]">
                Back to{" "}
                <Link href={loginPath} className="font-bold text-[#34373C] cursor-pointer hover:underline">
                    Login
                </Link>
            </p>
        </form>
    );
}
