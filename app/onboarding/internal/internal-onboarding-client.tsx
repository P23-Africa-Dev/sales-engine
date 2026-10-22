"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  acceptSalesEngineInvitation,
  previewSalesEngineInvitation,
  SalesEngineAuthError,
} from "@/lib/api/sales-engine-native-auth";
import { useAuthStore } from "@/store/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    password_confirmation: z.string().min(1, "Confirm your password."),
  })
  .refine((values) => values.password === values.password_confirmation, {
    path: ["password_confirmation"],
    message: "Password confirmation does not match.",
  });

type Values = z.infer<typeof schema>;

export default function InternalOnboardingClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const preview = useQuery({
    queryKey: ["sales-engine-invitation", token],
    queryFn: () => previewSalesEngineInvitation(token),
    enabled: token.length > 0,
    retry: false,
  });
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  const accept = useMutation({
    mutationFn: (values: Values) => acceptSalesEngineInvitation({ token, ...values }),
    onSuccess: (session) => {
      setUser({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        avatar: session.user.avatar_url ?? null,
        active_company: null,
      });
      toast.success("Welcome to the workspace.");
      router.push("/sales-engine");
    },
    onError: (error) => {
      toast.error(error instanceof SalesEngineAuthError ? error.message : "Could not accept the invitation.");
    },
  });

  if (!token) {
    return <p className="text-sm text-red-500">This invitation link is missing its token.</p>;
  }
  if (preview.isLoading) {
    return <p className="text-sm text-gray-500">Checking the invitation…</p>;
  }
  if (preview.isError) {
    return <p className="text-sm text-red-500">{preview.error instanceof Error ? preview.error.message : "This invitation is no longer valid."}</p>;
  }

  return (
    <div className="w-full max-w-115 flex flex-col gap-8">
      <div className="text-left md:text-center flex flex-col gap-3">
        <h2 className="text-[32px] font-extrabold leading-10 text-[#34373C]">Join {preview.data?.data.organization.name}</h2>
        <p className="text-sm text-gray-500">Set a password for {preview.data?.data.email}.</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => accept.mutate(values))}>
        <Input placeholder="Your name" {...register("name")} />
        {errors.name ? <p className="text-xs text-red-500">{errors.name.message}</p> : null}
        <Input type="password" placeholder="Password" autoComplete="new-password" {...register("password")} />
        {errors.password ? <p className="text-xs text-red-500">{errors.password.message}</p> : null}
        <Input type="password" placeholder="Confirm password" autoComplete="new-password" {...register("password_confirmation")} />
        {errors.password_confirmation ? <p className="text-xs text-red-500">{errors.password_confirmation.message}</p> : null}
        <Button type="submit" disabled={accept.isPending}>{accept.isPending ? "Joining..." : "Accept invitation"}</Button>
      </form>
    </div>
  );
}
