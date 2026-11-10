"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SectionDivider } from "@/components/payroll/payroll/section-divider";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineSelect } from "@/components/payroll/payroll/inline-select";
import PhoneNumberInput from "@/components/ui/phone-number-input";
import { listAvatars } from "@/lib/api/internal-onboarding";

const AVATAR_PAGE_SIZE = 4;

export interface AgentDetails {
  phone: string;
  gender: "male" | "female" | "";
  avatarKey: string;
}

interface AgentDetailsModalProps {
  isOpen: boolean;
  details: AgentDetails;
  onDetailsChange: (details: AgentDetails) => void;
  errors?: { phone?: string; gender?: string; avatarKey?: string };
  onClearError?: (field: "phone" | "gender" | "avatarKey") => void;
}

type AvatarItem = { key: string; url: string | null; svg: string | null };

function AgentAvatarGrid({
  avatars,
  selectedAvatarKey,
  hasMore,
  isLoadingMore,
  onSelect,
  onLoadMore,
}: {
  avatars: AvatarItem[];
  selectedAvatarKey: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onSelect: (avatarKey: string) => void;
  onLoadMore: () => void;
}) {
  const [failedImageKeys, setFailedImageKeys] = useState<Set<string>>(new Set());

  return (
    <div className="grid grid-cols-4 gap-2">
      {avatars.map((avatar) => (
        <button
          key={avatar.key}
          type="button"
          onClick={() => onSelect(avatar.key)}
          className={`h-14 w-14 rounded-full overflow-hidden border-2 transition-all ${selectedAvatarKey === avatar.key
            ? "border-[#094B5C] ring-2 ring-offset-1 ring-[#094B5C]/30"
            : "border-gray-200"
            }`}
          title={avatar.key}
        >
          {Boolean(avatar.url) && !failedImageKeys.has(avatar.key) ? (
            <img
              src={avatar.url ?? ""}
              alt={avatar.key}
              className="block h-full w-full object-cover"
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
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="h-14 w-14 rounded-2xl border border-gray-300 text-2xl text-gray-400 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label="Load more avatars"
        >
          {isLoadingMore ? "..." : "+"}
        </button>
      )}
    </div>
  );
}

export function AgentDetailsModal({
  isOpen,
  details,
  onDetailsChange,
  errors = {},
  onClearError,
}: AgentDetailsModalProps) {
  const normalizedGender = details.gender ? (details.gender as "male" | "female") : null;

  const avatarQuery = useInfiniteQuery({
    queryKey: ["internal-avatar-list", normalizedGender],
    queryFn: ({ pageParam }) =>
      listAvatars(normalizedGender as "male" | "female", {
        cursor: pageParam as number,
        limit: AVATAR_PAGE_SIZE,
      }),
    enabled: Boolean(normalizedGender) && isOpen,
    staleTime: 60_000,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
  });

  const avatarItems = useMemo(() => {
    return avatarQuery.data?.pages.flatMap((page) => page.data) ?? [];
  }, [avatarQuery.data]);

  const hasMoreAvatarPages = Boolean(avatarQuery.hasNextPage);
  const isLoadingMoreAvatars = avatarQuery.isFetchingNextPage;
  const visibleAvatars = avatarItems;
  const currentAvatar = useMemo(
    () => visibleAvatars.find((avatar) => avatar.key === details.avatarKey) ?? null,
    [details.avatarKey, visibleAvatars]
  );

  useEffect(() => {
    if (!normalizedGender || !isOpen || details.avatarKey || visibleAvatars.length === 0) {
      return;
    }

    onDetailsChange({
      ...details,
      avatarKey: visibleAvatars[0].key,
    });
  }, [details, details.avatarKey, isOpen, normalizedGender, onDetailsChange, visibleAvatars]);

  if (!isOpen) return null;

  const set = <K extends keyof AgentDetails>(key: K, val: AgentDetails[K]) =>
    onDetailsChange({ ...details, [key]: val });

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-end justify-center sm:justify-end p-0 sm:p-6 pointer-events-none">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs pointer-events-auto sm:hidden"
      />

      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:w-[420px] p-7 shadow-[0px_8px_32px_rgba(0,0,0,0.15)] flex flex-col max-h-[90dvh] sm:max-h-none overflow-y-auto sm:overflow-visible bottom-0 sm:absolute sm:right-[480px] sm:bottom-6 pointer-events-auto transition-all duration-300 ease-out">
        <h3 className="text-[20px] font-bold text-[#0B1215] mb-6">Agent Details</h3>

        <SectionDivider label="Personal Information" />

        <div className="space-y-4 mb-6">
          <div>
            <FormRow label="Phone Number">
              <div className="col-span-2">
                <PhoneNumberInput
                  variant="compact"
                  value={details.phone}
                  onChange={(value) => {
                    set("phone", value);
                    onClearError?.("phone");
                  }}
                  placeholder="E.g +234 9099999999"
                />
              </div>
            </FormRow>
            {errors.phone && (
              <p className="text-[11px] text-red-500 mt-0.5 text-right">{errors.phone}</p>
            )}
          </div>

          <div>
            <FormRow label="Gender">
              <InlineSelect
                value={details.gender}
                onChange={(v) => {
                  onDetailsChange({
                    ...details,
                    gender: v as "male" | "female" | "",
                    avatarKey: "",
                  });
                  onClearError?.("gender");
                  onClearError?.("avatarKey");
                }}
                options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
                placeholder="E.g Male"
                className="col-span-2"
              />
            </FormRow>
            {errors.gender && (
              <p className="text-[11px] text-red-500 mt-0.5 text-right">{errors.gender}</p>
            )}
          </div>
        </div>

        <SectionDivider label="Profile Picture" />

        <div className="pt-2 mb-6">
          <div className="mb-3">
            <p className="text-[11px] text-gray-500 mb-1">Avatar Preview</p>
            <div className="h-16 w-16 rounded-full border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
              {currentAvatar?.url ? (
                <img src={currentAvatar.url} alt="Selected avatar" className="h-full w-full object-cover" />
              ) : currentAvatar?.svg ? (
                <div
                  className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: currentAvatar.svg }}
                />
              ) : (
                <span className="text-[10px] text-gray-400">No avatar</span>
              )}
            </div>
          </div>

          <p className="text-[11px] text-gray-500 mb-2">Select an avatar for this user</p>

          {!normalizedGender ? (
            <p className="text-[11px] text-gray-400">Choose gender to load avatars.</p>
          ) : avatarQuery.isPending && visibleAvatars.length === 0 ? (
            <p className="text-[11px] text-gray-400">Loading avatars...</p>
          ) : avatarQuery.isError ? (
            <p className="text-[11px] text-red-500">Unable to load avatars right now.</p>
          ) : visibleAvatars.length === 0 ? (
            <p className="text-[11px] text-gray-400">No avatars available for selected gender.</p>
          ) : (
            <AgentAvatarGrid
              key={normalizedGender}
              avatars={visibleAvatars}
              selectedAvatarKey={details.avatarKey}
              hasMore={hasMoreAvatarPages}
              isLoadingMore={isLoadingMoreAvatars}
              onSelect={(avatarKey) => {
                set("avatarKey", avatarKey);
                onClearError?.("avatarKey");
              }}
              onLoadMore={() => {
                if (hasMoreAvatarPages && !isLoadingMoreAvatars) {
                  void avatarQuery.fetchNextPage();
                }
              }}
            />
          )}

          {errors.avatarKey && (
            <p className="text-[11px] text-red-500 mt-2 text-right">{errors.avatarKey}</p>
          )}
        </div>

        <div className="flex items-center justify-start">
          <button
            type="submit"
            form="add-agent-form"
            className="w-full sm:w-auto px-9.25 py-3 sm:py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
