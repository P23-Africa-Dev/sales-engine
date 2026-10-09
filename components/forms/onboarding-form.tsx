"use client";

import { ApiRequestError, getMe } from "@/lib/api/onboarding";
import {
  completeInternalInvitation,
  listAvatars,
  previewInternalInvitation,
} from "@/lib/api/internal-onboarding";
import { setAuthSession, setCompanyId } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useEffect, useMemo, useRef, useState } from "react";
import PhoneNumberInput from "@/components/ui/phone-number-input";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";

const onboardingSchema = z
  .object({
    phone_number: z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/, "Use a valid international number (e.g. +2348012345678)."),
    gender: z.enum(["male", "female"]),
    avatar_key: z.string().optional(),
    avatar_file: z.instanceof(File).optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[a-z]/, "Password must include at least one lowercase letter.")
      .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
      .regex(/[0-9]/, "Password must include at least one number.")
      .regex(/[^A-Za-z0-9]/, "Password must include at least one symbol."),
    password_confirmation: z.string().min(8, "Password confirmation is required."),
  })
  .refine((values) => values.password === values.password_confirmation, {
    path: ["password_confirmation"],
    message: "Passwords do not match.",
  })
  .superRefine((values, ctx) => {
    if (!values.avatar_key && !values.avatar_file) {
      ctx.addIssue({
        code: "custom",
        path: ["avatar_key"],
        message: "Select an avatar.",
      });
    }
  });

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

const INVITATION_ID_REGEX = /^[0-9]+$/;
const INVITE_TOKEN_REGEX = /^[A-Za-z0-9_-]{64}$/;
const AVATAR_PAGE_SIZE = 4;

type AvatarOption = { key: string; url: string | null; svg: string | null };

function AvatarPicker({
  avatars,
  selectedAvatarKey,
  onSelect,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  avatars: AvatarOption[];
  selectedAvatarKey?: string;
  onSelect: (avatarKey: string) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(avatars.length);
  const [failedImageKeys, setFailedImageKeys] = useState<Set<string>>(new Set());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState);
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [avatars]);

  // Auto-scroll to end when more avatars are loaded
  useEffect(() => {
    if (avatars.length > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: "smooth" });
    }
    prevCountRef.current = avatars.length;
  }, [avatars.length]);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -220 : 220, behavior: "smooth" });
  };

  if (avatars.length === 0) {
    return <p className="text-xs text-gray-400 text-center">No avatars available.</p>;
  }

  return (
    <div className="relative group">
      {/* Left arrow */}
      <button
        type="button"
        onClick={() => scroll("left")}
        className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-white shadow-md border border-gray-100 text-gray-500 hover:text-gray-800 transition-all ${
          canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-label="Scroll left"
      >
        <ChevronLeft size={16} />
      </button>

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        className="flex items-center gap-3 overflow-x-auto px-6 py-2 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {avatars.map((avatar) => {
          const isSelected = selectedAvatarKey === avatar.key;
          const shouldRenderImage = Boolean(avatar.url) && !failedImageKeys.has(avatar.key);
          return (
            <button
              key={avatar.key}
              type="button"
              onClick={() => onSelect(avatar.key)}
              className={`h-14 w-14 shrink-0 rounded-full overflow-hidden border-2 transition-all ${
                isSelected
                  ? "border-[#6FA8A6] ring-2 ring-[#6FA8A6]/30 scale-110"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              title={avatar.key}
            >
              {shouldRenderImage ? (
                <img
                  src={avatar.url ?? ""}
                  alt={avatar.key}
                  className="h-full w-full object-cover"
                  onError={() =>
                    setFailedImageKeys((prev) => {
                      const next = new Set(prev);
                      next.add(avatar.key);
                      return next;
                    })
                  }
                />
              ) : avatar.svg ? (
                <div
                  className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: avatar.svg }}
                />
              ) : (
                <div className="h-full w-full bg-gray-100" />
              )}
            </button>
          );
        })}

        {/* Load more button — lives inline at the end of the slider */}
        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="h-14 w-14 shrink-0 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-[#6FA8A6] hover:text-[#6FA8A6] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Load more avatars"
          >
            {isLoadingMore ? (
              <span className="animate-spin text-lg">⟳</span>
            ) : (
              <span className="text-2xl font-light leading-none">+</span>
            )}
          </button>
        )}
      </div>

      {/* Right arrow */}
      <button
        type="button"
        onClick={() => scroll("right")}
        className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-white shadow-md border border-gray-100 text-gray-500 hover:text-gray-800 transition-all ${
          canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-label="Scroll right"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export default function OnboardingForm({
  invitationId,
  token,
}: {
  invitationId: string;
  token: string;
}) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const previewQuery = useQuery({
    queryKey: ["internal-onboarding-preview", invitationId, token],
    queryFn: () =>
      previewInternalInvitation({
        invitation_id: invitationId,
        token,
      }),
    enabled: Boolean(invitationId && token),
    retry: false,
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isValid },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    mode: "onChange",
    defaultValues: {
      phone_number: "",
      gender: "male",
      avatar_key: "",
      avatar_file: undefined,
      password: "",
      password_confirmation: "",
    },
  });

  const completeMutation = useMutation({
    mutationFn: (values: OnboardingFormValues) =>
      completeInternalInvitation({
        invitation_id: invitationId,
        token,
        password: values.password,
        password_confirmation: values.password_confirmation,
        phone_number: values.phone_number,
        gender: values.gender,
        avatar_key: values.avatar_key,
        avatar_file: values.avatar_file,
      }),
    onSuccess: async (res) => {
      const authToken = res.data.token;
      setAuthSession(authToken, true);
      toast.success(res.message);

      try {
        const meRes = await getMe(authToken);
        if (meRes.data.active_company?.id) {
          setCompanyId(meRes.data.active_company.id);
        }
        setUser({
          id: meRes.data.id,
          name: meRes.data.name,
          email: meRes.data.email,
          avatar: meRes.data.avatar,
          active_company: meRes.data.active_company,
        });

        const role = meRes.data.active_company?.role;
        router.push(role === "agent" ? "/agent/dashboard" : "/dashboard");
      } catch {
        // no-op: session is already saved, redirect to agent dashboard as fallback
        router.push("/agent/dashboard");
      }
    },
    onError: (err: ApiRequestError | Error) => {
      if (err instanceof ApiRequestError && err.errors) {
        const fieldErrorMap: Array<[keyof OnboardingFormValues, string]> = [
          ["phone_number", "phone_number"],
          ["gender", "gender"],
          ["avatar_key", "avatar_key"],
          ["avatar_file", "avatar_file"],
          ["password", "password"],
          ["password_confirmation", "password_confirmation"],
        ];

        fieldErrorMap.forEach(([formField, apiField]) => {
          const firstError = err.errors?.[apiField]?.[0];
          if (firstError) {
            setError(formField, { message: firstError });
          }
        });
      }

      toast.error(err.message);
    },
  });

  const apiError = completeMutation.error as ApiRequestError | Error | null;
  const selectedGender = useWatch({
    control,
    name: "gender",
    defaultValue: "male",
  });
  const phoneNumber = useWatch({ control, name: "phone_number" });
  const selectedAvatarKey = useWatch({ control, name: "avatar_key" });
  const selectedAvatarFile = useWatch({ control, name: "avatar_file" });
  const hasValidInviteParams =
    INVITATION_ID_REGEX.test(invitationId) && INVITE_TOKEN_REGEX.test(token);
  const preview = previewQuery.data?.data;
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isAvatarQueryEnabled =
    (selectedGender === "male" || selectedGender === "female") &&
    hasValidInviteParams &&
    previewQuery.isSuccess;

  const genderAvatarsQuery = useInfiniteQuery({
    queryKey: ["internal-gender-avatars", selectedGender],
    queryFn: ({ pageParam }) =>
      listAvatars(selectedGender, {
        cursor: pageParam as number,
        limit: AVATAR_PAGE_SIZE,
      }),
    enabled: isAvatarQueryEnabled,
    staleTime: 60_000,
    retry: false,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
  });

  const hasMoreAvatarPages = Boolean(genderAvatarsQuery.hasNextPage);
  const isLoadingMoreAvatars = genderAvatarsQuery.isFetchingNextPage;

  const avatarOptions = useMemo(() => {
    const apiData = genderAvatarsQuery.data?.pages.flatMap((page) => page.data) ?? [];
    if (apiData.length > 0) return apiData;

    return (
      preview?.avatar_options_by_gender?.[selectedGender] ??
      preview?.avatar_options ??
      []
    );
  }, [genderAvatarsQuery.data, preview, selectedGender]);

  const isAvatarInitialLoading =
    isAvatarQueryEnabled &&
    genderAvatarsQuery.fetchStatus === "fetching" &&
    avatarOptions.length === 0;
  useEffect(() => {
    if (!preview || phoneNumber || !preview.prefilled_data.phone_number) return;
    const rawPhone = preview.prefilled_data.phone_number.replace(/\s+/g, "");
    setValue("phone_number", rawPhone, { shouldValidate: true });
  }, [phoneNumber, preview, setValue]);

  useEffect(() => {
    const prefilledGender = preview?.prefilled_data.gender;
    if (!prefilledGender) return;
    setValue("gender", prefilledGender, { shouldValidate: true });
  }, [preview?.prefilled_data.gender, setValue]);

  useEffect(() => {
    if (!preview || selectedAvatarKey) return;
    const preferredAvatar =
      preview.prefilled_data.avatar_key ?? preview.suggested_avatar_key ?? avatarOptions[0]?.key;
    if (preferredAvatar) {
      setValue("avatar_key", preferredAvatar, { shouldValidate: true });
    }
  }, [avatarOptions, preview, selectedAvatarKey, setValue]);

  if (!hasValidInviteParams) {
    return (
      <p className="text-xs text-red-500 text-center mb-4">
        Invalid invitation link. Please request a fresh invite.
      </p>
    );
  }

  if (previewQuery.isError || (previewQuery.isSuccess && !previewQuery.data?.success)) {
    return (
      <p className="text-xs text-red-500 text-center mb-4">
        This invitation is invalid or has expired.
      </p>
    );
  }

  const isSubmitDisabled =
    !isValid ||
    completeMutation.isPending ||
    previewQuery.isPending ||
    !preview;

  return (
    <form className="flex flex-col" onSubmit={handleSubmit((v) => completeMutation.mutate(v))}>
      {previewQuery.isPending && (
        <p className="text-xs text-gray-500 text-center mb-3">Loading invitation details...</p>
      )}

      {/* Read-only prefilled fields */}
      <Input
        type="text"
        placeholder="Full Name"
        className="mb-2 bg-gray-50 text-gray-500"
        value={preview?.user.name ?? ""}
        disabled
        readOnly
      />
      <Input
        type="email"
        placeholder="Email"
        className="mb-2 bg-gray-50 text-gray-500"
        value={preview?.user.email ?? ""}
        disabled
        readOnly
      />

      {/* Phone number */}
      <div className="mb-2">
        <Controller
          control={control}
          name="phone_number"
          render={({ field }) => (
            <PhoneNumberInput
              variant="default"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      {errors.phone_number && (
        <p className="text-xs text-red-500 mb-3 px-4">{errors.phone_number.message}</p>
      )}

      {/* Gender */}
      <div className="mb-2">
        <Select
          placeholder="Select Gender"
          {...register("gender", {
            onChange: () => {
              setValue("avatar_key", "", { shouldValidate: true });
              setValue("avatar_file", undefined, { shouldValidate: true });
              clearErrors(["avatar_key", "avatar_file"]);
            },
          })}
          options={[
            { label: "Male", value: "male" },
            { label: "Female", value: "female" },
          ]}
        />
      </div>
      {errors.gender && (
        <p className="text-xs text-red-500 mb-3 px-4">{errors.gender.message}</p>
      )}

      {/* Avatar slider */}
      <div className="mb-2">
        <input type="hidden" {...register("avatar_key")} />

        {isAvatarInitialLoading && (
          <p className="text-xs text-gray-400 text-center mb-2">Loading avatars...</p>
        )}
        {genderAvatarsQuery.isError && avatarOptions.length === 0 && (
          <div className="mb-2 flex flex-col items-center gap-2">
            <p className="text-xs text-red-500 text-center">Unable to load avatars right now.</p>
            <button
              type="button"
              onClick={() => {
                void genderAvatarsQuery.refetch();
              }}
              className="text-xs text-[#6FA8A6] hover:underline"
            >
              Retry loading avatars
            </button>
          </div>
        )}

        <p className="text-sm text-gray-500 mb-2 text-center">Select an avatar</p>
        <AvatarPicker
          key={selectedGender}
          avatars={avatarOptions}
          selectedAvatarKey={selectedAvatarKey}
          hasMore={hasMoreAvatarPages}
          isLoadingMore={isLoadingMoreAvatars}
          onLoadMore={() => {
            if (hasMoreAvatarPages && !isLoadingMoreAvatars) {
              void genderAvatarsQuery.fetchNextPage();
            }
          }}
          onSelect={(avatarKey) => {
            setValue("avatar_key", avatarKey, { shouldValidate: true });
            setValue("avatar_file", undefined, { shouldValidate: true });
            clearErrors(["avatar_key", "avatar_file"]);
          }}
        />
      </div>
      {errors.avatar_key && (
        <p className="text-xs text-red-500 mb-3 px-4">{errors.avatar_key.message}</p>
      )}
      {errors.avatar_file && (
        <p className="text-xs text-red-500 mb-3 px-4">{errors.avatar_file.message}</p>
      )}

      {/* Password */}
      <div className="relative mb-2">
        <Input
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          className="pr-14"
          {...register("password")}
        />
        <button
          type="button"
          onClick={() => setShowPassword((p) => !p)}
          className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {errors.password && (
        <p className="text-xs text-red-500 mb-3 px-4">{errors.password.message}</p>
      )}

      <div className="relative mb-6">
        <Input
          type={showConfirmPassword ? "text" : "password"}
          placeholder="Confirm Password"
          className="pr-14"
          {...register("password_confirmation")}
        />
        <button
          type="button"
          onClick={() => setShowConfirmPassword((p) => !p)}
          className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
        >
          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {errors.password_confirmation && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.password_confirmation.message}</p>
      )}

      {apiError && (
        <p className="text-xs text-red-500 text-center mb-4">{apiError.message}</p>
      )}

      <Button type="submit" disabled={isSubmitDisabled}>
        {previewQuery.isPending
          ? "Loading invitation..."
          : completeMutation.isPending
            ? "Finishing..."
            : "Complete Onboarding"}
      </Button>
    </form>
  );
}
