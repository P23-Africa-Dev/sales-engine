"use client";

import React, { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  User,
  Building2,
  ShieldCheck,
  X,
  Upload,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/sample";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuthStore } from "@/store/auth";
import { getAuthTokenFromDocument, getCompanyId } from "@/lib/auth/session";
import {
  getProfile,
  updateProfile,
  selectCatalogAvatar,
  uploadAvatarFile,
  getAvatarCatalog,
  extractAvatarItems,
  type ProfileData,
  type AvatarCatalogItem,
} from "@/lib/api/profile";
import { ApiRequestError } from "@/lib/api/onboarding";
import { resolveAvatarSrc } from "@/lib/avatar";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
      <div
        className={cn(
          "flex items-center gap-3 px-6 py-4 border-b border-black/5",
          accent,
        )}
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/70 shadow-sm">
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-gray-800 tracking-wide uppercase">
          {title}
        </h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReadOnlyValue({ value }: { value: string | null | undefined }) {
  return (
    <p className="text-sm font-medium text-gray-700 bg-gray-50 rounded-xl px-3.5 py-2.5 border border-black/5">
      {value ?? "—"}
    </p>
  );
}

function EditableInput({
  value,
  onChange,
  placeholder,
  disabled,
  error,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  type?: string;
}) {
  return (
    <div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full text-sm font-medium text-gray-800 bg-white rounded-xl px-3.5 py-2.5 border outline-none transition-all",
          "focus:ring-2 focus:ring-[#4fd1c5]/30 focus:border-[#4fd1c5]",
          disabled
            ? "bg-gray-50 text-gray-400 border-black/5 cursor-not-allowed"
            : "border-black/10 hover:border-[#4fd1c5]/50",
          error && "border-red-400 focus:ring-red-200",
        )}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function EditableSelect({
  value,
  onChange,
  options,
  disabled,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Select…"
        disabled={disabled}
        className={cn(
          "w-full text-sm font-medium text-gray-800 bg-white rounded-xl px-3.5 py-2.5 border outline-none transition-all",
          disabled
            ? "bg-gray-50 text-gray-400 border-black/5 cursor-not-allowed"
            : "border-black/10 hover:border-[#4fd1c5]/50",
          error && "border-red-400",
        )}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
        active
          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
          : "bg-red-50 text-red-600 border border-red-100",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          active ? "bg-emerald-500" : "bg-red-500",
        )}
      />
      {label ?? (active ? "Active" : "Inactive")}
    </span>
  );
}

// ─── Avatar Modal ─────────────────────────────────────────────────────────────

type AvatarModalTab = "catalog" | "upload";

function AvatarModal({
  currentGender,
  onClose,
  onSelectKey,
  onUploadFile,
  isSaving,
}: {
  currentGender: string | null;
  onClose: () => void;
  onSelectKey: (key: string, gender: string) => void;
  onUploadFile: (file: File) => void;
  isSaving: boolean;
}) {
  const [tab, setTab] = useState<AvatarModalTab>("catalog");
  const [gender, setGender] = useState<string>(currentGender ?? "male");
  const [catalog, setCatalog] = useState<AvatarCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = getAuthTokenFromDocument();

  const fetchCatalog = useCallback(
    async (g: string, c: number, reset = false) => {
      if (!token) return;
      setCatalogLoading(true);
      try {
        const res = await getAvatarCatalog(
          { gender: g, limit: 12, cursor: c },
          token,
        );
        const items = extractAvatarItems(res.data);
        setCatalog((prev) => (reset ? items : [...prev, ...items]));
        const meta =
          !Array.isArray(res.data) &&
          (res.data as { meta?: { has_more?: boolean; cursor?: number } }).meta;
        setHasMore(meta ? (meta.has_more ?? false) : false);
        setCursor(meta ? (meta.cursor ?? c + 12) : c + 12);
      } catch {
        toast.error("Failed to load avatars.");
      } finally {
        setCatalogLoading(false);
      }
    },
    [token],
  );

  const [catalogInitialized, setCatalogInitialized] = useState(false);

  if (!catalogInitialized) {
    setCatalogInitialized(true);
    void fetchCatalog(gender, 0, true);
  }

  const handleGenderChange = (g: string) => {
    setGender(g);
    setCursor(0);
    setSelectedKey(null);
    void fetchCatalog(g, 0, true);
  };

  function handleFileChange(file: File | null) {
    if (!file) return;
    if (
      !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
        file.type,
      )
    ) {
      toast.error("Only JPEG, PNG, or WebP images are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB.");
      return;
    }
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setUploadPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
            <h3
              className="text-base font-bold text-gray-900"
              style={{ fontFamily: "var(--font-montserrat)" }}
            >
              Change Profile Photo
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-6 pt-4">
            {(["catalog", "upload"] as AvatarModalTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-semibold transition-all",
                  tab === t
                    ? "bg-[#09232D] text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50",
                )}
              >
                {t === "catalog" ? "Choose Avatar" : "Upload Photo"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {tab === "catalog" && (
              <div className="flex flex-col gap-4">
                {/* Gender selector */}
                <div className="flex gap-2">
                  {["male", "female"].map((g) => (
                    <button
                      key={g}
                      onClick={() => handleGenderChange(g)}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-sm font-medium border transition-all",
                        gender === g
                          ? "border-[#4fd1c5] bg-[#4fd1c5]/10 text-[#2a9d92]"
                          : "border-black/10 text-gray-500 hover:border-[#4fd1c5]/50",
                      )}
                    >
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Grid */}
                {catalogLoading && catalog.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2
                      size={28}
                      className="animate-spin text-[#4fd1c5]"
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      {catalog.map((item) => (
                        <button
                          key={item.key}
                          onClick={() => setSelectedKey(item.key)}
                          className={cn(
                            "relative aspect-square rounded-2xl overflow-hidden border-2 transition-all",
                            selectedKey === item.key
                              ? "border-[#4fd1c5] shadow-lg shadow-[#4fd1c5]/20 scale-105"
                              : "border-transparent hover:border-[#4fd1c5]/40 hover:scale-102",
                          )}
                        >
                          <Image
                            src={resolveAvatarSrc(item.url)}
                            alt={item.key}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                          {selectedKey === item.key && (
                            <div className="absolute inset-0 bg-[#4fd1c5]/20 flex items-center justify-center">
                              <CheckCircle2
                                size={20}
                                className="text-[#4fd1c5] drop-shadow"
                              />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    {hasMore && (
                      <button
                        onClick={() => fetchCatalog(gender, cursor)}
                        disabled={catalogLoading}
                        className="w-full py-2.5 rounded-xl text-sm font-medium border border-black/10 text-gray-600 hover:border-[#4fd1c5]/50 hover:text-[#2a9d92] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {catalogLoading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        Load more
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "upload" && (
              <div className="flex flex-col gap-4">
                {/* Drop zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileChange(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
                    isDragging
                      ? "border-[#4fd1c5] bg-[#4fd1c5]/5"
                      : "border-black/10 hover:border-[#4fd1c5]/50 hover:bg-gray-50/50",
                  )}
                >
                  {uploadPreview ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-[#4fd1c5]/40 shadow-md">
                        <Image
                          src={uploadPreview}
                          alt="Preview"
                          width={96}
                          height={96}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-sm text-gray-600 font-medium">
                        {uploadFile?.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        Click to change image
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-[#09232D]/5 flex items-center justify-center">
                        <Upload size={20} className="text-[#09232D]/40" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-700">
                          Drop your image here
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          JPEG, PNG or WebP · Max 5MB
                        </p>
                      </div>
                      <span className="px-4 py-1.5 bg-[#09232D] text-white text-xs font-semibold rounded-full">
                        Browse
                      </span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) =>
                      handleFileChange(e.target.files?.[0] ?? null)
                    }
                  />
                </div>
                <p className="text-xs text-gray-400 text-center">
                  Your previous custom image will be replaced automatically.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-black/5 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-black/10 text-gray-600 hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              disabled={
                isSaving ||
                (tab === "catalog" && !selectedKey) ||
                (tab === "upload" && !uploadFile)
              }
              onClick={() => {
                if (tab === "catalog" && selectedKey) {
                  onSelectKey(selectedKey, gender);
                } else if (tab === "upload" && uploadFile) {
                  onUploadFile(uploadFile);
                }
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#09232D] text-white hover:bg-[#0d2d3a] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {isSaving ? "Saving…" : "Apply"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();
  const token = getAuthTokenFromDocument();
  const companyId = getCompanyId();

  // ── profile query ──────────────────────────────────────────────────────────
  const {
    data: profileEnvelope,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["profile", companyId],
    queryFn: () => getProfile(token, companyId),
    enabled: !!token,
  });

  const profile: ProfileData | undefined = profileEnvelope?.data;
  const perms = profile?.permissions;

  // ── identity form state ────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [syncedProfileId, setSyncedProfileId] = useState<number | undefined>();

  const profileId = profile?.identity.id;

  if (profile && profileId !== syncedProfileId) {
    setSyncedProfileId(profileId);
    setName(profile.identity.full_name ?? "");
    setPhone(profile.identity.phone_number ?? "");
    setGender(profile.identity.gender ?? "");
    setCountry(profile.organization.company.country ?? "");
  }

  // ── save identity mutation ─────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateProfile>[0]) =>
      updateProfile(payload, token),
    onSuccess: (res) => {
      toast.success("Profile updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      if (res.data?.identity?.avatar_url && user) {
        setUser({
          ...user,
          name: res.data.identity.full_name,
          avatar: res.data.identity.avatar_url,
        });
      }
      setFieldErrors({});
    },
    onError: (err) => {
      if (err instanceof ApiRequestError && err.errors) {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.errors)) {
          flat[k] = v[0];
        }
        setFieldErrors(flat);
        toast.error("Please fix the highlighted fields.");
      } else {
        toast.error((err as Error).message || "Failed to update profile.");
      }
    },
  });

  function handleSaveIdentity() {
    const payload: Parameters<typeof updateProfile>[0] = {};
    if (companyId) payload.company_id = companyId;
    if (perms?.can_edit_name) payload.name = name;
    if (perms?.can_edit_phone_number) payload.phone_number = phone;
    if (perms?.can_edit_gender) payload.gender = gender;
    if (perms?.can_edit_country) payload.country = country;
    saveMutation.mutate(payload);
  }

  // ── avatar state ───────────────────────────────────────────────────────────
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  const avatarMutation = useMutation({
    mutationFn: async (args: {
      key?: string;
      file?: File;
      gender?: string;
    }) => {
      if (args.key) {
        return selectCatalogAvatar(
          { avatar_key: args.key, gender: args.gender, company_id: companyId },
          token,
        );
      }
      if (args.file) {
        return uploadAvatarFile(
          {
            avatar_file: args.file,
            gender: profile?.identity.gender ?? undefined,
            company_id: companyId,
          },
          token,
        );
      }
      throw new Error("No avatar data provided.");
    },
    onSuccess: (res) => {
      toast.success("Profile photo updated.");
      setShowAvatarModal(false);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      if (res.data?.identity?.avatar_url && user) {
        setUser({ ...user, avatar: res.data.identity.avatar_url });
      }
    },
    onError: (err) => {
      if (err instanceof ApiRequestError && err.errors) {
        const msgs = Object.values(err.errors).flat();
        toast.error(msgs[0] || "Failed to update photo.");
      } else {
        toast.error((err as Error).message || "Failed to update photo.");
      }
    },
  });

  const avatarSrc = resolveAvatarSrc(profile?.identity.avatar_url ?? user?.avatar);
  const isAvatarSrcExternal = avatarSrc.startsWith("http");

  // ── derived ────────────────────────────────────────────────────────────────
  const accountStatus = profile?.account.status ?? "—";
  const isAccountActive = accountStatus === "active";
  const emailVerified = profile?.account.email_verified ?? false;
  const onboarding = profile?.account.onboarding;

  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#09232D] flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-[#4fd1c5]" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen bg-[#09232D] flex flex-col items-center justify-center gap-4 text-white">
        <p className="text-white/60">Failed to load your profile.</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium transition-all flex items-center gap-2"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-full text-white overflow-x-hidden">
        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="bg-dash-bg pb-16 relative z-10 rounded-t-3xl shadow-inner mt-0.5">
          <div className="max-w-6xl mx-auto px-4 md:px-6 pt-10 grid grid-cols-1 lg:grid-cols-4 gap-5">
            {/* left profile avatar */}
            <div className="relative z-10 flex flex-col gap-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#09232D] mb-2 flex items-center gap-2">
                <ChevronRight size={12} className="opacity-40" />
                My Profile
              </p>

              <div className="flex flex-col items-center md:items-end gap-6 md:gap-10">
                <div className="relative shrink-0">
                  <div className="w-28 h-28 md:w-[300px] md:h-[300px] rounded-3xl overflow-hidden border-4 border-white/10 shadow-2xl bg-white/5">
                    <Image
                      src={avatarSrc}
                      alt="Profile"
                      width={144}
                      height={144}
                      className="w-full h-full object-cover"
                      unoptimized={isAvatarSrcExternal}
                      priority
                    />
                  </div>
                  <button
                    onClick={() => setShowAvatarModal(true)}
                    className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-[#4fd1c5] text-[#09232D] flex items-center justify-center shadow-lg hover:bg-[#38b2a8] transition-all hover:scale-105 active:scale-95"
                  >
                    <Camera size={16} />
                  </button>
                </div>

                <div className="flex flex-col items-center gap-3 text-center">
                  <h1
                    className="text-3xl font-bold text-[#09232D] leading-tight"
                    style={{ fontFamily: "var(--font-montserrat)" }}
                  >
                    {profile?.identity.full_name}
                  </h1>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-[#4fd1c5]/15 border border-[#4fd1c5]/30 text-[#4fd1c5] text-xs font-semibold">
                      {roleLabel(profile?.organization.role)}
                    </span>
                    {profile?.organization.user_type && (
                      <span className="px-3 py-1 rounded-full bg-black/5 border border-black/10 text-gray-600 text-xs font-medium">
                        {roleLabel(profile?.organization.user_type)}
                      </span>
                    )}
                    <span className="px-3 py-1 rounded-full bg-black/5 border border-black/10 text-gray-600 text-xs font-medium">
                      {profile?.organization.company.name}
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm">
                    {profile?.identity.email}
                  </p>
                </div>
              </div>
            </div>

            {/* ── center column: Identity + Organization ── */}
            <div className="flex flex-col gap-5 lg:col-span-2">
              Identity
              <SectionCard
                icon={<User size={15} className="text-[#4fd1c5]" />}
                title="Identity"
                accent="bg-[#4fd1c5]/5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldRow label="Full Name">
                    {perms?.can_edit_name ? (
                      <EditableInput
                        value={name}
                        onChange={setName}
                        placeholder="Your full name"
                        error={fieldErrors.name}
                      />
                    ) : (
                      <ReadOnlyValue value={profile?.identity.full_name} />
                    )}
                  </FieldRow>

                  <FieldRow label="Email">
                    <ReadOnlyValue value={profile?.identity.email} />
                  </FieldRow>

                  <FieldRow label="Phone Number">
                    {perms?.can_edit_phone_number ? (
                      <EditableInput
                        value={phone}
                        onChange={setPhone}
                        placeholder="+2348000000000"
                        error={fieldErrors.phone_number}
                      />
                    ) : (
                      <ReadOnlyValue value={profile?.identity.phone_number} />
                    )}
                  </FieldRow>

                  <FieldRow label="Gender">
                    {perms?.can_edit_gender ? (
                      <EditableSelect
                        value={gender}
                        onChange={setGender}
                        options={[
                          { label: "Male", value: "male" },
                          { label: "Female", value: "female" },
                          { label: "Other", value: "other" },
                        ]}
                        error={fieldErrors.gender}
                      />
                    ) : (
                      <ReadOnlyValue
                        value={roleLabel(profile?.identity.gender)}
                      />
                    )}
                  </FieldRow>
                </div>

                {(perms?.can_edit_name ||
                  perms?.can_edit_phone_number ||
                  perms?.can_edit_gender) && (
                  <div className="mt-5 flex justify-end">
                    <button
                      onClick={handleSaveIdentity}
                      disabled={saveMutation.isPending}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#09232D] text-white text-sm font-semibold hover:bg-[#0d2d3a] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {saveMutation.isPending && (
                        <Loader2 size={14} className="animate-spin" />
                      )}
                      {saveMutation.isPending ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                )}
              </SectionCard>

              {/* Organization */}
              <SectionCard
                icon={<Building2 size={15} className="text-[#d15fe2]" />}
                title="Organization"
                accent="bg-[#d15fe2]/5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldRow label="Company Name">
                    <ReadOnlyValue value={profile?.organization.company.name} />
                  </FieldRow>

                  <FieldRow label="Company ID">
                    <ReadOnlyValue
                      value={profile?.organization.company.company_id}
                    />
                  </FieldRow>

                  <FieldRow label="Role">
                    <ReadOnlyValue
                      value={roleLabel(profile?.organization.role)}
                    />
                  </FieldRow>

                  <FieldRow label="Membership">
                    <ReadOnlyValue
                      value={roleLabel(
                        profile?.organization.membership.relation,
                      )}
                    />
                  </FieldRow>

                  <FieldRow label="Team Size">
                    <ReadOnlyValue
                      value={profile?.organization.company.team_size}
                    />
                  </FieldRow>

                  <FieldRow label="Country">
                    {perms?.can_edit_country ? (
                      <EditableInput
                        value={country}
                        onChange={setCountry}
                        placeholder="e.g. NG, US"
                        error={fieldErrors.country}
                      />
                    ) : (
                      <ReadOnlyValue
                        value={profile?.organization.company.country}
                      />
                    )}
                  </FieldRow>

                  <FieldRow label="Purpose">
                    <ReadOnlyValue
                      value={roleLabel(profile?.organization.company.purpose)}
                    />
                  </FieldRow>

                  <FieldRow label="Joined">
                    <ReadOnlyValue
                      value={formatDate(
                        profile?.organization.membership.joined_at,
                      )}
                    />
                  </FieldRow>
                </div>

                {perms?.can_edit_country && (
                  <div className="mt-5 flex justify-end">
                    <button
                      onClick={handleSaveIdentity}
                      disabled={saveMutation.isPending}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#09232D] text-white text-sm font-semibold hover:bg-[#0d2d3a] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {saveMutation.isPending && (
                        <Loader2 size={14} className="animate-spin" />
                      )}
                      {saveMutation.isPending ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* ── Right column: Account ── */}
            <div className="flex flex-col gap-5">
              <SectionCard
                icon={<ShieldCheck size={15} className="text-[#3182ce]" />}
                title="Account"
                accent="bg-[#3182ce]/5"
              >
                <div className="flex flex-col gap-5">
                  {/* Status */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                        Status
                      </span>
                      <StatusBadge
                        active={isAccountActive}
                        label={roleLabel(accountStatus)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                        Email
                      </span>
                      <StatusBadge
                        active={emailVerified}
                        label={emailVerified ? "Verified" : "Unverified"}
                      />
                    </div>
                  </div>

                  {/* Onboarding */}
                  {onboarding && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
                        Onboarding
                      </p>
                      <div className="flex flex-col gap-2">
                        {[
                          {
                            label: "Self serve",
                            done: onboarding.self_serve_completed,
                            at: onboarding.self_serve_completed_at,
                          },
                          {
                            label: "Enterprise",
                            done: onboarding.enterprise_completed,
                            at: onboarding.enterprise_completed_at,
                          },
                          {
                            label: "Internal",
                            done: onboarding.internal_completed,
                            at: onboarding.internal_completed_at,
                          },
                        ].map((step) => (
                          <div
                            key={step.label}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gray-50 border border-black/5"
                          >
                            {step.done ? (
                              <CheckCircle2
                                size={14}
                                className="text-emerald-500 shrink-0"
                              />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0" />
                            )}
                            <span className="text-xs font-medium text-gray-600 flex-1">
                              {step.label}
                            </span>
                            {step.done && step.at && (
                              <span className="text-[10px] text-gray-400">
                                {formatDate(step.at)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="flex flex-col gap-2.5 pt-1 border-t border-black/5">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock size={12} className="shrink-0" />
                      <span>
                        Joined{" "}
                        <span className="font-medium text-gray-600">
                          {formatDate(profile?.account.created_at)}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <RefreshCw size={12} className="shrink-0" />
                      <span>
                        Updated{" "}
                        <span className="font-medium text-gray-600">
                          {formatDate(profile?.account.updated_at)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Profile photo card */}
              <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 flex flex-col items-center gap-4 text-center">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-[#4fd1c5]/20 shadow-sm">
                  <Image
                    src={avatarSrc}
                    alt="Your avatar"
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                    unoptimized={isAvatarSrcExternal}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Profile Photo
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {profile?.identity.avatar_source === "catalog"
                      ? "Using catalog avatar"
                      : profile?.identity.avatar_source === "upload"
                        ? "Custom uploaded image"
                        : "Default avatar"}
                  </p>
                </div>
                <button
                  onClick={() => setShowAvatarModal(true)}
                  className="w-full py-2.5 rounded-xl bg-[#09232D] text-white text-sm font-semibold hover:bg-[#0d2d3a] transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Camera size={14} />
                  Change Photo
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Avatar modal */}
      {showAvatarModal && (
        <AvatarModal
          currentGender={profile?.identity.gender}
          onClose={() => setShowAvatarModal(false)}
          onSelectKey={(key, g) => avatarMutation.mutate({ key, gender: g })}
          onUploadFile={(file) => avatarMutation.mutate({ file })}
          isSaving={avatarMutation.isPending}
        />
      )}
    </>
  );
}
