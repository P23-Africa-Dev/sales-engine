"use client";

import { registerWithSalesEngine, SalesEngineAuthError } from "@/lib/api/sales-engine-native-auth";
import { useAuthStore } from "@/store/auth";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

const registerSchema = z
  .object({
    name: z.string().min(2, "Full name must be at least 2 characters."),
    email: z.string().email("Please enter a valid email address."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[a-zA-Z]/, "Password must contain at least one letter.")
      .regex(/[0-9]/, "Password must contain at least one number."),
    password_confirmation: z.string().min(1, "Please confirm your password."),
  })
  .refine((d) => d.password === d.password_confirmation, {
    message: "Passwords do not match.",
    path: ["password_confirmation"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

const EyeOpen = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10a13.35 13.35 0 0 0 9 4 13.35 13.35 0 0 0 9-4" />
    <path d="M12 14v4" />
    <path d="M8.5 13.5l-2 3" />
    <path d="M15.5 13.5l2 3" />
  </svg>
);

export default function SignupForm() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const [
    nameValue,
    emailValue,
    passwordValue,
    passwordConfirmationValue
  ] = useWatch({
    control,
    name: ["name", "email", "password", "password_confirmation"],
  });

  const isFilled =
    nameValue?.trim() !== "" &&
    emailValue?.trim() !== "" &&
    passwordValue?.trim() !== "" &&
    passwordConfirmationValue?.trim() !== "";

  const registerMutation = useMutation({
    mutationFn: (values: RegisterFormValues) =>
      registerWithSalesEngine({
        name: values.name,
        email: values.email,
        password: values.password,
        password_confirmation: values.password_confirmation,
        organization_name: values.name,
      }),
    onSuccess: (session) => {
      setUser({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        avatar: null,
        active_company: null,
      });
      toast.success("Account created.");
      router.push("/sales-engine");
    },
    onError: (err: SalesEngineAuthError) => {
      toast.error(err.message || "Registration failed. Please try again.");
    },
  });

  const onSubmit = (values: RegisterFormValues) => {
    registerMutation.mutate(values);
  };

  const apiError = registerMutation.error as SalesEngineAuthError | null;

  return (
    <>
      <form className="flex flex-col" onSubmit={handleSubmit(onSubmit)}>
        <label className="auth-field-label" htmlFor="auth-name">Full Name <span aria-hidden="true">*</span></label>
        <Input
          id="auth-name"
          type="text"
          placeholder="Full Name"
          className="mb-2"
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-red-500 mb-4 px-4">{errors.name.message}</p>
        )}

        <label className="auth-field-label" htmlFor="auth-email">Email Address <span aria-hidden="true">*</span></label>
        <Input
          id="auth-email"
          type="email"
          placeholder="Email"
          className="mb-2"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-red-500 mb-4 px-4">{errors.email.message}</p>
        )}

        <div className="auth-password-field relative mb-2 mt-2">
          <label className="auth-field-label" htmlFor="auth-password">Password <span aria-hidden="true">*</span></label>
        <Input
          id="auth-password"
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            className="w-full pr-12"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors focus:outline-none"
            tabIndex={-1}
          >
            {showPassword ? <EyeOpen /> : <EyeOff />}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-red-500 mb-4 px-4">{errors.password.message}</p>
        )}

        <div className="auth-password-field relative mb-2 mt-2">
          <label className="auth-field-label" htmlFor="auth-password_confirmation">Confirm Password <span aria-hidden="true">*</span></label>
        <Input
          id="auth-password_confirmation"
            type={showConfirm ? "text" : "password"}
            placeholder="Confirm Password"
            className="w-full pr-12"
            {...register("password_confirmation")}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors focus:outline-none"
            tabIndex={-1}
          >
            {showConfirm ? <EyeOpen /> : <EyeOff />}
          </button>
        </div>
        {errors.password_confirmation && (
          <p className="text-xs text-red-500 mb-4 px-4">{errors.password_confirmation.message}</p>
        )}

        {apiError && (
          <p className="text-xs text-red-500 mb-4 px-4">{apiError.message}</p>
        )}

        <div className="flex flex-col md:gap-3 gap-6 mt-4">
          <Button type="submit" disabled={!isFilled || registerMutation.isPending}>
            {registerMutation.isPending ? "Creating..." : "Create Account"}
          </Button>
          <p className="text-center text-xs text-[#A9AAAB]">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-[#34373C] cursor-pointer hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        {/* <div className="flex items-center gap-2.5 md:mt-16 mt-4.5 md:mb-4.75 mb-3.5 h-9.5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-[#A9AAAB]">Or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div> */}

        {/* <Button variant="outline" className="gap-3">
          <Image
            src={GoogleLogo}
            alt="Google Logo"
            width={31}
            height={31}
            className="object-contain"
          />
          Continue with Google
        </Button> */}
      </form>
    </>
  );
}
