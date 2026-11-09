"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Sparkles,
  Building2,
  Users,
  MapPin,
  Target,
  Sliders,
  Check,
  Plus,
  ArrowRight,
  Briefcase,
  ArrowLeft,
  Edit2,
  Trash2,
  Copy,
  CheckCircle2,
  Layers,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Toggle } from "@/components/ui/toggle";
import { getApiErrorMessage } from "@/lib/api/errors";
import { searchGeoPlaces } from "@/lib/api/sales-engine";
import {
  useActivateIcpProfile,
  useCreateIcpProfile,
  useDeleteIcpProfile,
  useDuplicateIcpProfile,
  useIcpProfiles,
  useSuggestIcpSearchBrief,
  useUpdateIcpProfile,
} from "@/hooks/use-sales-engine-icp";
import {
  composeIcpQualifySummary,
  composeIcpSearchBrief,
  composeIcpSearchQueries,
  clampToMaxWords,
  countWords,
  wordsRemaining,
  ICP_BRIEF_MAX_WORDS,
  isInsufficientIcpSearchBrief,
  scoreIcpStrength,
  suggestIcpSearchBriefLocal,
  expandKeywordPool,
  nextVisibleKeywords,
} from "@/lib/sales-engine/icp-search-brief";

export type IcpConfig = {
  profileName: string;
  description?: string;
  industries: string[];
  companySizes: string[];
  revenueRanges: string[];
  territories: string[];
  decisionMakers: string[];
  minMatchScore: number;
  autoSyncCrm: boolean;
  enrichContactDetails: boolean;
  customPrompt?: string | null;
  searchKeywords?: string[];
  exclusions?: string[];
  /**
   * Stage 2 signal-type packs. Core Buyer Signals (`default`) is on unless
   * the user clears every pack — save then sends `none` so the backend does
   * not silently re-enable the default pack.
   */
  signalTypePacks?: string[];
};

export type IcpProfile = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  leadCount: number;
  lastUpdated: string;
  config: IcpConfig;
};

const BLANK_ICP_CONFIG: IcpConfig = {
  profileName: "",
  description: "",
  industries: ["FMCG & Retail"],
  companySizes: ["51-200"],
  revenueRanges: ["$1M - $10M"],
  territories: ["Lagos, Nigeria"],
  decisionMakers: ["Head of Sales"],
  minMatchScore: 60,
  autoSyncCrm: true,
  enrichContactDetails: true,
  customPrompt: "",
  searchKeywords: [],
  exclusions: [],
  signalTypePacks: ["default"],
};

export function normalizeIcpConfig(config?: Partial<IcpConfig> | null): IcpConfig {
  return {
    profileName: config?.profileName ?? "",
    description: config?.description ?? "",
    industries: Array.isArray(config?.industries) ? config.industries : BLANK_ICP_CONFIG.industries,
    companySizes: Array.isArray(config?.companySizes) ? config.companySizes : BLANK_ICP_CONFIG.companySizes,
    revenueRanges: Array.isArray(config?.revenueRanges) ? config.revenueRanges : BLANK_ICP_CONFIG.revenueRanges,
    territories: Array.isArray(config?.territories) ? config.territories : BLANK_ICP_CONFIG.territories,
    decisionMakers: Array.isArray(config?.decisionMakers) ? config.decisionMakers : BLANK_ICP_CONFIG.decisionMakers,
    minMatchScore: typeof config?.minMatchScore === "number" ? config.minMatchScore : 60,
    autoSyncCrm: config?.autoSyncCrm ?? true,
    enrichContactDetails: config?.enrichContactDetails ?? true,
    customPrompt: config?.customPrompt ?? "",
    searchKeywords: Array.isArray(config?.searchKeywords) ? config.searchKeywords : [],
    exclusions: Array.isArray(config?.exclusions) ? config.exclusions : [],
    signalTypePacks: Array.isArray(config?.signalTypePacks) ? config.signalTypePacks : ["default"],
  };
}

const AVAILABLE_INDUSTRIES = [
  "FMCG & Retail",
  "Logistics & Fleet",
  "Agro & Commodities",
  "Fintech & Payments",
  "Health & Pharma",
  "Manufacturing",
  "Energy & Utilities",
  "Construction & Real Estate",
];

const AVAILABLE_COMPANY_SIZES = [
  { label: "1-10", desc: "Micro" },
  { label: "11-50", desc: "Small" },
  { label: "51-200", desc: "Mid-Market" },
  { label: "201-500", desc: "Growth" },
  { label: "500+", desc: "Enterprise" },
];

const AVAILABLE_REVENUE_RANGES = [
  "< $500K",
  "$500K - $1M",
  "$1M - $10M",
  "$10M - $50M",
  "$50M+",
];

const AVAILABLE_TERRITORIES = [
  "Lagos, Nigeria",
  "Abuja, Nigeria",
  "Nairobi, Kenya",
  "Accra, Ghana",
  "Johannesburg, South Africa",
  "London, England",
  "Berlin, Germany",
  "Amsterdam, Netherlands",
];

const AVAILABLE_DECISION_MAKERS = [
  "Head of Sales",
  "Chief Commercial Officer",
  "Supply Chain Director",
  "Procurement Manager",
  "Managing Director / CEO",
  "Operations Director",
  "Head of Growth",
];

/**
 * Discrete signal-type packs a Social Listening scan can opt into (see
 * SignalTypeRegistry / SignalTypeDefinition::PACK_* on the backend). Keys
 * must match the backend's `pack` values exactly.
 */
const AVAILABLE_SIGNAL_TYPE_PACKS: Array<{ value: string; label: string; description: string }> = [
  {
    value: "default",
    label: "Core Buyer Signals",
    description: "New market entry, distribution/partnership announcements, leadership hires, export/trade activity.",
  },
  {
    value: "software_dev_vertical",
    label: "Software / Dev Buying Signals",
    description: "Engineering disruption, outages, complaints, unfilled dev roles, digital transformation announcements.",
  },
  {
    value: "lagos_corporate_transport",
    label: "Lagos Corporate Transport",
    description: "New embassy/consulate presence, expat relocation, Lagos-based leadership hires, foreign market entry into Lagos.",
  },
];

interface IcpBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When set, open this profile and run Strengthen into the form. */
  tightenProfileId?: string | null;
  onTightenHandled?: () => void;
}

export function IcpBuilderModal({
  isOpen,
  onClose,
  tightenProfileId = null,
  onTightenHandled,
}: IcpBuilderModalProps) {
  // If user has existing profiles, default to "list" view; otherwise immediately open "form" view
  const [viewMode, setViewMode] = useState<"list" | "form">("list");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const [formConfig, setFormConfig] = useState<IcpConfig>(BLANK_ICP_CONFIG);
  const [activeTab, setActiveTab] = useState<"criteria" | "scoring">("criteria");

  const [customIndustryInput, setCustomIndustryInput] = useState("");
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [customTerritoryInput, setCustomTerritoryInput] = useState("");
  const [geoSuggestions, setGeoSuggestions] = useState<
    Array<{ label: string; type: string; country: string; gl: string }>
  >([]);
  const [geoSearchLoading, setGeoSearchLoading] = useState(false);
  const geoSearchTimer = useRef<number | null>(null);
  const autoBriefRef = useRef("");
  const [briefKeywords, setBriefKeywords] = useState<string[]>([]);
  const [keywordPool, setKeywordPool] = useState<string[]>([]);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [isStrengthening, setIsStrengthening] = useState(false);
  const [strengthenPreview, setStrengthenPreview] = useState<{
    brief: string;
    keywords: string[];
    industries: string[];
    decisionMakers: string[];
    companySizes: string[];
    exclusions: string[];
    minMatchScore: number;
  } | null>(null);
  const tightenHandledRef = useRef<string | null>(null);

  const isProfileNameValid = Boolean((formConfig.profileName ?? "").trim().length > 0);
  const isDescriptionValid = Boolean((formConfig.description ?? "").trim().length > 0);
  const isCustomPromptValid = Boolean((formConfig.customPrompt ?? "").trim().length > 0);
  const isTerritoryValid = formConfig.territories.length > 0;
  const isFormValid = isProfileNameValid && isDescriptionValid && isCustomPromptValid && isTerritoryValid;

  const showProfileNameError = (hasAttemptedSubmit || touchedFields.profileName) && !isProfileNameValid;
  const showDescriptionError = (hasAttemptedSubmit || touchedFields.description) && !isDescriptionValid;
  const showCustomPromptError = (hasAttemptedSubmit || touchedFields.customPrompt) && !isCustomPromptValid;
  const showTerritoryError = hasAttemptedSubmit && !isTerritoryValid;

  const {
    data: profiles = [],
    isLoading: isLoadingProfiles,
    isAuthLoading,
    authError,
    error: profilesError,
  } = useIcpProfiles();
  const isConnecting = isAuthLoading || isLoadingProfiles;
  const connectionError = authError ?? profilesError;

  const createProfile = useCreateIcpProfile({
    onSuccess: (profile) => {
      toast.success(`Created & Activated "${profile.name}"`);
      setViewMode("list");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to create ICP build.")),
  });
  const updateProfile = useUpdateIcpProfile({
    onSuccess: (profile) => {
      toast.success(`Updated "${profile.name}"`);
      setViewMode("list");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to update ICP build.")),
  });
  const deleteProfile = useDeleteIcpProfile({
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to remove ICP build.")),
  });
  const activateProfile = useActivateIcpProfile({
    onSuccess: (profile) => toast.success(`Switched active ICP to "${profile.name}"`),
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to activate ICP build.")),
  });
  const duplicateProfile = useDuplicateIcpProfile({
    onSuccess: (profile) => toast.success(`Duplicated "${profile.name}"`),
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to duplicate ICP build.")),
  });
  const suggestBrief = useSuggestIcpSearchBrief();

  useEffect(() => {
    // Seed chips from industries/description only when the pool is empty (don't wipe AI results).
    if (keywordPool.length > 0) return;
    const local = suggestIcpSearchBriefLocal({
      industries: formConfig.industries,
      description: formConfig.description,
      profileName: formConfig.profileName,
    });
    const pool = local.keywords ?? [];
    setKeywordPool(pool);
    setBriefKeywords(nextVisibleKeywords(pool, formConfig.customPrompt ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only seed once when empty
  }, [formConfig.industries, formConfig.description, formConfig.profileName]);

  useEffect(() => {
    if (keywordPool.length === 0) return;
    setBriefKeywords(nextVisibleKeywords(keywordPool, formConfig.customPrompt ?? ""));
  }, [formConfig.customPrompt, keywordPool]);

  useEffect(() => {
    // Grow the pool when industries change without clearing AI suggestions.
    setKeywordPool((prev) => {
      const next = expandKeywordPool({
        brief: formConfig.customPrompt,
        industries: formConfig.industries,
        existing: prev,
        excludeInText: formConfig.customPrompt,
      });
      if (
        next.length === prev.length &&
        next.every((keyword, index) => keyword === prev[index])
      ) {
        return prev;
      }
      return next;
    });
  }, [formConfig.industries, formConfig.customPrompt]);

  const icpStrength = scoreIcpStrength({
    profileName: formConfig.profileName,
    description: formConfig.description,
    customPrompt: formConfig.customPrompt,
    industries: formConfig.industries,
    territories: formConfig.territories,
    decisionMakers: formConfig.decisionMakers,
    keywords: formConfig.searchKeywords ?? keywordPool,
  });

  useEffect(() => {
    if (!isOpen) {
      tightenHandledRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !tightenProfileId) return;
    if (isConnecting || connectionError || profiles.length === 0) return;
    if (tightenHandledRef.current === tightenProfileId) return;

    const profile =
      profiles.find((p) => p.id === tightenProfileId) ??
      profiles.find((p) => p.isActive) ??
      profiles[0];
    if (!profile) return;

    tightenHandledRef.current = tightenProfileId;
    const normalized = normalizeIcpConfig(profile.config);
    setEditingProfileId(profile.id);
    setHasAttemptedSubmit(false);
    setTouchedFields({});
    setFormConfig(normalized);
    autoBriefRef.current = "";
    const pool = suggestIcpSearchBriefLocal({
      industries: normalized.industries,
      description: normalized.description,
      profileName: normalized.profileName,
    }).keywords;
    setKeywordPool(pool);
    setBriefKeywords(nextVisibleKeywords(pool, normalized.customPrompt ?? ""));
    setActiveTab("criteria");
    setViewMode("form");

    let cancelled = false;
    (async () => {
      setIsStrengthening(true);
      try {
        const mode = (normalized.customPrompt ?? "").trim() ? "improve" : "generate";
        const result = await suggestBrief.mutateAsync({
          mode,
          profileName: normalized.profileName,
          customPrompt: normalized.customPrompt ?? "",
          description: normalized.description,
          industries: normalized.industries,
          territories: normalized.territories,
          decisionMakers: normalized.decisionMakers,
        });
        if (cancelled) return;
        const brief = clampToMaxWords(result.brief.trim(), ICP_BRIEF_MAX_WORDS).trim();
        if (
          !brief ||
          isInsufficientIcpSearchBrief({
            customPrompt: brief,
            description: normalized.description,
            industries: normalized.industries,
          })
        ) {
          toast.error("Couldn’t strengthen this brief. Add products or buyers, then try again.");
          return;
        }
        const expanded = expandKeywordPool({
          brief,
          industries: normalized.industries,
          existing: result.keywords,
          excludeInText: brief,
        });
        setKeywordPool(expanded);
        setBriefKeywords(nextVisibleKeywords(expanded, brief));
        setFormConfig((prev) => ({ ...prev, customPrompt: brief }));
        toast.success("ICP strengthened. Review the brief, then save.");
      } catch (error) {
        if (!cancelled) {
          toast.error(getApiErrorMessage(error, "Couldn’t strengthen this ICP."));
        }
      } finally {
        if (!cancelled) {
          setIsStrengthening(false);
          onTightenHandled?.();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    tightenProfileId,
    profiles,
    isConnecting,
    connectionError,
    suggestBrief,
    onTightenHandled,
  ]);

  if (!isOpen) return null;

  // Determine initial display if profiles is empty (wait for the first load to settle first)
  const isFormOnly = !isConnecting && !connectionError && profiles.length === 0;
  const currentMode = isFormOnly ? "form" : viewMode;

  const handleStartCreateNew = () => {
    setEditingProfileId(null);
    setHasAttemptedSubmit(false);
    setTouchedFields({});
    setFormConfig({
      ...BLANK_ICP_CONFIG,
      profileName: `New ICP Build #${profiles.length + 1}`,
      description: "",
      customPrompt: "",
    });
    autoBriefRef.current = "";
    setBriefKeywords([]);
    setKeywordPool([]);
    setActiveTab("criteria");
    setViewMode("form");
  };

  const handleStartEdit = (profile: IcpProfile) => {
    setEditingProfileId(profile.id);
    setHasAttemptedSubmit(false);
    setTouchedFields({});
    const normalized = normalizeIcpConfig(profile.config);
    setFormConfig(normalized);
    autoBriefRef.current = "";
    const pool = suggestIcpSearchBriefLocal({
      industries: normalized.industries,
      description: normalized.description,
      profileName: normalized.profileName,
    }).keywords;
    setKeywordPool(pool);
    setBriefKeywords(nextVisibleKeywords(pool, normalized.customPrompt ?? ""));
    setActiveTab("criteria");
    setViewMode("form");
  };

  const handleDuplicate = (profile: IcpProfile) => {
    duplicateProfile.mutate(profile.id);
  };

  const handleDelete = (id: string, name: string) => {
    deleteProfile.mutate(id, { onSuccess: () => toast.success(`Removed "${name}"`) });
  };

  const handleActivateProfile = (profile: IcpProfile) => {
    if (profile.isActive) return;
    if (
      isInsufficientIcpSearchBrief({
        customPrompt: profile.config?.customPrompt,
        description: profile.description || profile.config?.description,
        industries: profile.config?.industries,
      })
    ) {
      toast.error(
        "This ICP needs a niche “What we search for” before it can be activated. Edit the profile first."
      );
      return;
    }
    activateProfile.mutate(profile.id);
  };

  const toggleArrayItem = (key: keyof IcpConfig, item: string) => {
    setFormConfig((prev) => {
      const currentList = Array.isArray(prev[key]) ? ([...(prev[key] as string[])]) : [];
      const exists = currentList.includes(item);
      return {
        ...prev,
        [key]: exists
          ? currentList.filter((i) => i !== item)
          : [...currentList, item],
      };
    });
  };

  const handleAddCustomIndustry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customIndustryInput.trim()) return;
    if (!formConfig.industries.includes(customIndustryInput.trim())) {
      setFormConfig((prev) => ({
        ...prev,
        industries: [...prev.industries, customIndustryInput.trim()],
      }));
    }
    setCustomIndustryInput("");
  };

  const handleAddCustomRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customRoleInput.trim()) return;
    if (!formConfig.decisionMakers.includes(customRoleInput.trim())) {
      setFormConfig((prev) => ({
        ...prev,
        decisionMakers: [...prev.decisionMakers, customRoleInput.trim()],
      }));
    }
    setCustomRoleInput("");
  };

  const handleTerritorySearchChange = (value: string) => {
    setCustomTerritoryInput(value);
    if (geoSearchTimer.current != null) {
      window.clearTimeout(geoSearchTimer.current);
    }
    const q = value.trim();
    if (q.length < 2) {
      setGeoSuggestions([]);
      return;
    }
    geoSearchTimer.current = window.setTimeout(async () => {
      setGeoSearchLoading(true);
      try {
        const places = await searchGeoPlaces(q, 12);
        setGeoSuggestions(places);
      } catch {
        setGeoSuggestions([]);
      } finally {
        setGeoSearchLoading(false);
      }
    }, 250);
  };

  const handleSelectGeoPlace = (label: string) => {
    if (!formConfig.territories.includes(label)) {
      setFormConfig((prev) => ({
        ...prev,
        territories: [...prev.territories, label],
      }));
    }
    setCustomTerritoryInput("");
    setGeoSuggestions([]);
  };

  const handleAddCustomTerritory = (e: React.FormEvent) => {
    e.preventDefault();
    const match = geoSuggestions.find(
      (place) => place.label.toLowerCase() === customTerritoryInput.trim().toLowerCase()
    );
    if (!match) {
      toast.error("Pick a country or city from the search results.");
      return;
    }
    handleSelectGeoPlace(match.label);
  };

  function applySuggestedBrief(brief: string, keywords: string[]) {
    autoBriefRef.current = "";
    const clamped = clampToMaxWords(brief, ICP_BRIEF_MAX_WORDS).trim();
    const pool = expandKeywordPool({
      brief: clamped,
      industries: formConfig.industries,
      existing: keywords,
      excludeInText: clamped,
    });
    setKeywordPool(pool);
    setBriefKeywords(nextVisibleKeywords(pool, clamped));
    setFormConfig((prev) => ({ ...prev, customPrompt: clamped, searchKeywords: pool }));
  }

  function applyStrengthenPreview(preview: NonNullable<typeof strengthenPreview>) {
    autoBriefRef.current = "";
    const clamped = clampToMaxWords(preview.brief, ICP_BRIEF_MAX_WORDS).trim();
    const pool = expandKeywordPool({
      brief: clamped,
      industries: preview.industries.length > 0 ? preview.industries : formConfig.industries,
      existing: preview.keywords,
      excludeInText: clamped,
    });
    setKeywordPool(pool);
    setBriefKeywords(nextVisibleKeywords(pool, clamped));
    setFormConfig((prev) => ({
      ...prev,
      customPrompt: clamped,
      searchKeywords: pool,
      industries: preview.industries.length > 0 ? preview.industries : prev.industries,
      decisionMakers: preview.decisionMakers.length > 0 ? preview.decisionMakers : prev.decisionMakers,
      companySizes: preview.companySizes.length > 0 ? preview.companySizes : prev.companySizes,
      exclusions: preview.exclusions,
      minMatchScore: preview.minMatchScore || prev.minMatchScore,
    }));
    setStrengthenPreview(null);
  }

  function insertBriefKeyword(keyword: string) {
    const token = keyword.trim();
    if (!token) return;
    setFormConfig((prev) => {
      const prompt = prev.customPrompt ?? "";
      if (prompt.toLowerCase().includes(token.toLowerCase())) {
        return prev;
      }
      const next = clampToMaxWords(`${prompt.trim()} ${token}`.trim(), ICP_BRIEF_MAX_WORDS);
      autoBriefRef.current = "";
      const expanded = expandKeywordPool({
        brief: next,
        industries: prev.industries,
        existing: keywordPool,
        excludeInText: next,
      });
      setKeywordPool(expanded);
      setBriefKeywords(nextVisibleKeywords(expanded, next));
      return { ...prev, customPrompt: next };
    });
  }

  async function handleSuggestBrief(mode: "generate" | "improve" | "regenerate") {
    try {
      const result = await suggestBrief.mutateAsync({
        mode,
        profileName: formConfig.profileName,
        customPrompt: formConfig.customPrompt ?? "",
        description: formConfig.description,
        industries: formConfig.industries,
        territories: formConfig.territories,
        decisionMakers: formConfig.decisionMakers,
      });
      if (!result.brief.trim()) {
        toast.error("Couldn’t draft a search phrase. Add a product or buyer noun and try again.");
        return;
      }
      applySuggestedBrief(result.brief, result.keywords);
      toast.success(
        mode === "improve"
          ? "Search phrase improved for discovery."
          : mode === "regenerate"
            ? "New search phrase drafted."
            : "Search phrase generated from your ICP."
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to generate search keywords."));
    }
  }

  const persistIcp = (config: IcpConfig) => {
    const profileTitle = (config.profileName ?? "").trim() || "Untitled ICP Build";
    const selectedPacks = (config.signalTypePacks ?? []).filter((pack) => pack !== "none");
    const payloadConfig: IcpConfig = {
      ...config,
      profileName: profileTitle,
      description: config.description?.trim() ?? "",
      customPrompt: config.customPrompt?.trim() ?? "",
      signalTypePacks: selectedPacks.length > 0 ? selectedPacks : ["none"],
    };

    if (editingProfileId) {
      updateProfile.mutate({
        id: editingProfileId,
        payload: { name: profileTitle, description: payloadConfig.description, config: payloadConfig },
      });
    } else {
      createProfile.mutate({
        name: profileTitle,
        description: payloadConfig.description || "Custom configured target ICP profile.",
        config: payloadConfig,
      });
    }
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      setHasAttemptedSubmit(true);
      setActiveTab("criteria");
      if (!isProfileNameValid) {
        toast.error("ICP Profile Name is required.");
      } else if (!isDescriptionValid) {
        toast.error("Description / Target Objective is required.");
      } else if (!isCustomPromptValid) {
        toast.error("What kind of opportunity you are looking for is required.");
      } else if (!isTerritoryValid) {
        toast.error("Pick at least one country or city from the catalog.");
      }
      return;
    }

    if (
      isInsufficientIcpSearchBrief({
        customPrompt: formConfig.customPrompt ?? "",
        description: formConfig.description,
        industries: formConfig.industries,
      })
    ) {
      toast.error(
        "Add a niche “What we search for” (products, buyers, or exclusions) before saving this ICP."
      );
      return;
    }

    persistIcp(formConfig);
  };

  const handleStrengthenIcp = async () => {
    const hasStory =
      (formConfig.customPrompt ?? "").trim() ||
      (formConfig.description ?? "").trim() ||
      (formConfig.profileName ?? "").trim();
    if (!hasStory) {
      toast.error("Add who you sell to or what you search for before strengthening.");
      return;
    }

    setIsStrengthening(true);
    try {
      const before = icpStrength.score;
      const payload = {
        profileName: formConfig.profileName,
        customPrompt: formConfig.customPrompt ?? "",
        description: formConfig.description,
        industries: formConfig.industries,
        territories: formConfig.territories,
        decisionMakers: formConfig.decisionMakers,
        companySizes: formConfig.companySizes,
        minMatchScore: formConfig.minMatchScore,
      };
      const mode = (formConfig.customPrompt ?? "").trim() ? "improve" : "generate";
      let result = await suggestBrief.mutateAsync({ mode, ...payload });
      const afterScore = (brief: string, keywords: string[], industries: string[], buyers: string[]) =>
        scoreIcpStrength({
          profileName: formConfig.profileName,
          description: formConfig.description,
          customPrompt: brief,
          industries,
          territories: formConfig.territories,
          decisionMakers: buyers,
          keywords,
        }).score;

      let brief = clampToMaxWords(result.brief.trim(), ICP_BRIEF_MAX_WORDS).trim();
      if (afterScore(brief, result.keywords, result.industries ?? [], result.decisionMakers ?? []) <= before) {
        result = await suggestBrief.mutateAsync({ mode: "regenerate", ...payload });
        brief = clampToMaxWords(result.brief.trim(), ICP_BRIEF_MAX_WORDS).trim();
      }

      if (
        !brief ||
        isInsufficientIcpSearchBrief({
          customPrompt: brief,
          description: formConfig.description,
          industries: result.industries ?? formConfig.industries,
        })
      ) {
        toast.error("Couldn’t strengthen this brief. Add products or buyers, then try again.");
        return;
      }

      setStrengthenPreview({
        brief,
        keywords: result.keywords,
        industries: result.industries ?? [],
        decisionMakers: result.decisionMakers ?? [],
        companySizes: result.companySizes ?? [],
        exclusions: result.exclusions ?? [],
        minMatchScore: result.minMatchScore ?? formConfig.minMatchScore,
      });
      toast.success("Review the strengthened ICP, then accept to apply it.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn’t strengthen this ICP."));
    } finally {
      setIsStrengthening(false);
    }
  };

  const isSavingForm = createProfile.isPending || updateProfile.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-end justify-center sm:justify-end p-0 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 cursor-pointer"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative bg-white rounded-t-[28px] sm:rounded-[28px] w-full sm:w-[520px] md:w-[560px] shadow-[0px_16px_48px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100vh-60px)] transition-all duration-300 ease-out border border-gray-100">
        
        {/* Header with Signature Curve & Gradient */}
        <div className="relative h-20 bg-gradient-to-r from-[#09232D] via-[#0D3645] to-[#0A2632] px-6 flex items-center justify-between shrink-0 overflow-hidden text-white shadow-sm">
          {/* Background Decorative SVG curves & glows */}
          <div className="absolute -top-12 -right-8 w-44 h-44 bg-gradient-to-br from-[#0EA5E9]/30 to-[#10B981]/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute top-0 right-0 w-[45%] h-full pointer-events-none opacity-40">
            <svg
              viewBox="0 0 200 80"
              fill="none"
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <path
                d="M0 0 C70 30, 30 55, 190 80 L200 100 L200 0 Z"
                fill="#ffffff"
                fillOpacity="0.12"
              />
            </svg>
          </div>

          <div className="relative z-10 flex items-center gap-3">
            {currentMode === "form" && profiles.length > 0 ? (
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white/90 backdrop-blur-md ring-1 ring-white/20 hover:bg-white/20 transition-colors cursor-pointer"
                title="Back to Profiles"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/25 shadow-inner">
                <Sparkles className="h-5 w-5 text-[#38BDF8]" />
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-bold tracking-tight text-white">
                  {currentMode === "list"
                    ? "ICP Builds & Profiles"
                    : editingProfileId
                    ? "Edit ICP Build"
                    : "Create ICP Build"}
                </h2>
                <span className="rounded-full bg-gradient-to-r from-emerald-400/20 to-teal-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                  {profiles.length} Active Builds
                </span>
              </div>
              <p className="text-[11px] text-white/70">
                {currentMode === "list"
                  ? "Select, manage or switch targeting models for Sales Engine"
                  : "Define target criteria & qualification rules for prospect discovery"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* MODE 1: LIST VIEW (When profiles exist) */}
        {currentMode === "list" && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#fafafa]">
            {/* Action Bar */}
            <div className="flex items-center justify-between border-b border-gray-200/70 bg-white px-6 py-3 shrink-0">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-700">
                <Layers size={15} className="text-[#09232D]" />
                <span>Switch Targeting Model</span>
              </div>
              <button
                type="button"
                onClick={handleStartCreateNew}
                className="flex items-center gap-1.5 rounded-xl bg-[#09232D] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-xs hover:bg-[#0d3645] transition-colors cursor-pointer"
              >
                <Plus size={14} className="stroke-[2.5]" />
                New ICP Build
              </button>
            </div>

            {/* Scrollable Profiles List */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5">
              {isConnecting && !connectionError && (
                <p className="py-8 text-center text-[12px] text-gray-400">
                  {isAuthLoading ? "Connecting to Sales Engine…" : "Loading ICP builds…"}
                </p>
              )}
              {connectionError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
                  <p className="text-[12px] font-semibold text-red-700">
                    Couldn&apos;t connect to Sales Engine
                  </p>
                  <p className="mt-1 text-[11px] text-red-500">
                    {getApiErrorMessage(connectionError, "Please try again.")}
                  </p>
                </div>
              )}
              {profiles.map((prof) => {
                const isActive = prof.isActive;
                return (
                  <div
                    key={prof.id}
                    className={`group relative rounded-2xl border bg-white p-4.5 transition-all duration-200 shadow-xs ${
                      isActive
                        ? "border-[#09232D] ring-2 ring-[#09232D]/10 bg-gradient-to-br from-white via-white to-sky-50/30"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                    }`}
                  >
                    {/* Top Row: Name & Status Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleActivateProfile(prof)}
                          className="mt-0.5 shrink-0 cursor-pointer"
                          title={isActive ? "Currently Active" : "Click to Activate"}
                        >
                          {isActive ? (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#09232D] text-white shadow-xs ring-2 ring-[#09232D]/20">
                              <Check size={12} className="stroke-[3]" />
                            </div>
                          ) : (
                            <div className="h-5 w-5 rounded-full border-2 border-gray-300 hover:border-[#09232D] transition-colors" />
                          )}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-[14px] font-bold text-[#09232D] leading-snug">
                              {prof.name}
                            </h3>
                            {isActive && (
                              <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold">
                                Active Model
                              </span>
                            )}
                          </div>
                          {prof.description && (
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                              {prof.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Top Right Action Icons */}
                      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(prof)}
                          className="p-1.5 text-gray-400 hover:text-[#09232D] hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit ICP Profile"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(prof)}
                          className="p-1.5 text-gray-400 hover:text-[#09232D] hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Duplicate Profile"
                        >
                          <Copy size={14} />
                        </button>
                        {profiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDelete(prof.id, prof.name)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Profile"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Criteria Tags Summary */}
                    <div className="mt-3.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                        {(prof.config?.industries ?? []).slice(0, 2).join(", ")}
                        {(prof.config?.industries ?? []).length > 2
                          ? ` +${(prof.config?.industries ?? []).length - 2}`
                          : ""}
                      </span>
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                        📍 {(prof.config?.territories ?? []).slice(0, 2).join(", ")}
                        {(prof.config?.territories ?? []).length > 2
                          ? ` +${(prof.config?.territories ?? []).length - 2}`
                          : ""}
                      </span>
                      <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/50 px-2 py-0.5 text-[10px] font-semibold">
                        🎯 {prof.config?.minMatchScore ?? 60}% Min Fit
                      </span>
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                        👥 {(prof.config?.decisionMakers ?? []).length} Roles
                      </span>
                    </div>

                    {/* Bottom Activation / Selection Bar */}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400 pt-1">
                      <span>Updated {prof.lastUpdated}</span>
                      {!isActive ? (
                        <button
                          type="button"
                          onClick={() => handleActivateProfile(prof)}
                          className="font-semibold text-[#09232D] hover:underline cursor-pointer flex items-center gap-1"
                        >
                          Activate in Sales Engine <ArrowRight size={12} />
                        </button>
                      ) : (
                        <span className="font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Driving Active Discovery
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* List Footer */}
            <div className="border-t border-gray-200/80 bg-white px-6 py-4 flex items-center justify-between shrink-0">
              <span className="text-[12px] text-gray-500">
                Active ICP drives prospect ranking & auto-qualification.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-[#09232D] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#0d3645] transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* MODE 2: FORM VIEW (Create / Edit ICP) */}
        {currentMode === "form" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab Navigation (2 Clean Tabs) */}
            <div className="flex border-b border-gray-100 bg-[#fbfbfb] px-6 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("criteria")}
                className={`flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-all cursor-pointer ${
                  activeTab === "criteria"
                    ? "border-[#09232D] text-[#09232D]"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <Target size={15} />
                Target Criteria
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("scoring")}
                className={`flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-all cursor-pointer ${
                  activeTab === "scoring"
                    ? "border-[#09232D] text-[#09232D]"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <Sliders size={15} />
                Scoring & Automation
              </button>
            </div>

            <div className="shrink-0 border-b border-gray-100 bg-white px-6 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      ICP strength
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        icpStrength.band === "strong"
                          ? "bg-emerald-100 text-emerald-800"
                          : icpStrength.band === "fair"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {icpStrength.label} · {icpStrength.score}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        icpStrength.band === "strong"
                          ? "bg-emerald-500"
                          : icpStrength.band === "fair"
                            ? "bg-sky-500"
                            : "bg-amber-500"
                      }`}
                      style={{ width: `${icpStrength.score}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-gray-500">{icpStrength.hint}</p>
                </div>
                <button
                  type="button"
                  disabled={isStrengthening || isSavingForm}
                  onClick={() => void handleStrengthenIcp()}
                  className="shrink-0 rounded-xl border border-[#09232D]/15 bg-[#09232D] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[#0d3645] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  {isStrengthening ? "Strengthening…" : "Strengthen ICP"}
                </button>
              </div>
              {strengthenPreview && (
                <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                    Strengthened ICP — accept to apply
                  </p>
                  <p className="mt-1.5 text-[12px] leading-snug text-[#09232D]">
                    {strengthenPreview.brief}
                  </p>
                  {composeIcpSearchQueries({
                    customPrompt: strengthenPreview.brief,
                    industries: strengthenPreview.industries,
                    keywords: strengthenPreview.keywords,
                  }).length > 0 && (
                    <p className="mt-1 text-[11px] text-gray-500">
                      Searches:{" "}
                      {composeIcpSearchQueries({
                        customPrompt: strengthenPreview.brief,
                        industries: strengthenPreview.industries,
                        keywords: strengthenPreview.keywords,
                      }).join(" · ")}
                    </p>
                  )}
                  <ul className="mt-2 space-y-0.5 text-[11px] text-gray-600">
                    {strengthenPreview.industries.join(", ") !== formConfig.industries.join(", ") && (
                      <li>Industries: {strengthenPreview.industries.join(", ") || "—"}</li>
                    )}
                    {strengthenPreview.decisionMakers.join(", ") !== formConfig.decisionMakers.join(", ") && (
                      <li>Buyers: {strengthenPreview.decisionMakers.join(", ") || "—"}</li>
                    )}
                    {strengthenPreview.companySizes.join(", ") !== formConfig.companySizes.join(", ") && (
                      <li>Sizes: {strengthenPreview.companySizes.join(", ") || "—"}</li>
                    )}
                    {strengthenPreview.keywords.length > 0 && (
                      <li>Keywords: {strengthenPreview.keywords.slice(0, 8).join(", ")}</li>
                    )}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => applyStrengthenPreview(strengthenPreview)}
                      className="rounded-lg bg-[#09232D] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setStrengthenPreview(null)}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Scrollable Form Body */}
            <form
              id="icp-builder-form"
              onSubmit={handleSaveForm}
              className="flex-1 overflow-y-auto px-6 py-5 text-[#09232D]"
            >
              {/* TAB 1: TARGET CRITERIA */}
              {activeTab === "criteria" && (
                <div className="space-y-5">
                  {/* Profile Preset Name */}
                  <div>
                    <label className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-gray-700">
                      <span className="flex items-center gap-1">
                        <span>ICP Profile Name</span>
                        <span className="text-red-500 font-bold" aria-hidden="true">*</span>
                      </span>
                      <span className="text-[11px] font-normal text-gray-400">
                        Required
                      </span>
                    </label>
                    <input
                      type="text"
                      value={formConfig.profileName ?? ""}
                      onChange={(e) =>
                        setFormConfig((prev) => ({ ...prev, profileName: e.target.value }))
                      }
                      onBlur={() =>
                        setTouchedFields((prev) => ({ ...prev, profileName: true }))
                      }
                      placeholder="e.g. Tier-1 FMCG Distributors"
                      className={`w-full rounded-2xl border px-4 py-3 text-[13px] text-[#09232D] outline-none transition-all placeholder:text-gray-400 ${
                        showProfileNameError
                          ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                          : "border-gray-200 bg-[#F6F6F6] focus:border-[#09232D]/40 focus:bg-white focus:ring-2 focus:ring-[#09232D]/10"
                      }`}
                      required
                    />
                    {showProfileNameError && (
                      <p className="mt-1 text-[11px] font-medium text-red-600">
                        ICP Profile Name is required.
                      </p>
                    )}
                  </div>

                  {/* Profile Description */}
                  <div>
                    <label className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-gray-700">
                      <span className="flex items-center gap-1">
                        <span>Description / Target Objective</span>
                        <span className="text-red-500 font-bold" aria-hidden="true">*</span>
                      </span>
                      <span className="text-[11px] font-normal text-gray-400">
                        Required
                      </span>
                    </label>
                    <input
                      type="text"
                      value={formConfig.description ?? ""}
                      onChange={(e) =>
                        setFormConfig((prev) => ({ ...prev, description: e.target.value }))
                      }
                      onBlur={() =>
                        setTouchedFields((prev) => ({ ...prev, description: true }))
                      }
                      placeholder="e.g. B2B SaaS and supply-chain logistics providers in East & West Africa expanding enterprise operations…"
                      className={`w-full rounded-xl border px-4 py-2.5 text-[12px] text-[#09232D] outline-none transition-all placeholder:text-gray-400 ${
                        showDescriptionError
                          ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                          : "border-gray-200 bg-[#F6F6F6] focus:border-[#09232D]/40 focus:bg-white"
                      }`}
                      required
                    />
                    {showDescriptionError && (
                      <p className="mt-1 text-[11px] font-medium text-red-600">
                        Description / Target Objective is required.
                      </p>
                    )}
                  </div>

                  {/* Target Industries */}
                  <div className="space-y-2.5">
                    <div className="rounded-2xl border border-gray-100 bg-[#FBFBFB] px-3.5 py-2.5">
                      <p className="text-[12px] font-semibold text-[#09232D]">
                        Filter criteria: a company must match these to qualify
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
                        Industry, size, and revenue gate which companies appear. Territory locates the search and then rejects other countries.
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
                        <Building2 size={15} className="text-gray-400" />
                        Target Industry Verticals
                      </label>
                      <span className="text-[11px] text-gray-400">
                        {formConfig.industries.length} selected
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_INDUSTRIES.map((ind) => {
                        const isSelected = formConfig.industries.includes(ind);
                        return (
                          <button
                            key={ind}
                            type="button"
                            onClick={() => toggleArrayItem("industries", ind)}
                            className={`group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#09232D] text-white shadow-xs"
                                : "bg-[#f3f4f6] text-gray-600 hover:bg-gray-200/80 hover:text-gray-900"
                            }`}
                          >
                            {isSelected ? (
                              <Check size={12} className="stroke-[3]" />
                            ) : (
                              <Plus size={12} className="text-gray-400 group-hover:text-gray-600" />
                            )}
                            {ind}
                          </button>
                        );
                      })}
                      {formConfig.industries
                        .filter((ind) => !AVAILABLE_INDUSTRIES.includes(ind))
                        .map((ind) => (
                          <button
                            key={ind}
                            type="button"
                            onClick={() => toggleArrayItem("industries", ind)}
                            className="flex items-center gap-1.5 rounded-full bg-[#09232D] px-3 py-1.5 text-[12px] font-medium text-white shadow-xs cursor-pointer"
                          >
                            <Check size={12} className="stroke-[3]" />
                            {ind}
                            <X size={12} className="text-white/60" />
                          </button>
                        ))}
                    </div>

                    {/* Custom Industry Input */}
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={customIndustryInput}
                        onChange={(e) => setCustomIndustryInput(e.target.value)}
                        placeholder="Add other custom industry..."
                        className="flex-1 rounded-xl border border-gray-200 bg-[#F6F6F6] px-3.5 py-2 text-[12px] text-[#09232D] outline-none placeholder:text-gray-400 focus:border-[#09232D]/30 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomIndustry}
                        className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Company Headcount */}
                  <div className="space-y-2.5">
                    <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
                      <Users size={15} className="text-gray-400" />
                      Target Company Size (Employees)
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {AVAILABLE_COMPANY_SIZES.map((size) => {
                        const isSelected = formConfig.companySizes.includes(size.label);
                        return (
                          <button
                            key={size.label}
                            type="button"
                            onClick={() => toggleArrayItem("companySizes", size.label)}
                            className={`flex flex-col items-center justify-center rounded-xl p-2 text-center transition-all cursor-pointer border ${
                              isSelected
                                ? "border-[#09232D] bg-[#09232D] text-white shadow-xs"
                                : "border-gray-200 bg-[#F6F6F6] text-gray-700 hover:border-gray-300 hover:bg-gray-100"
                            }`}
                          >
                            <span className="text-[12px] font-bold">{size.label}</span>
                            <span
                              className={`text-[9px] ${
                                isSelected ? "text-white/70" : "text-gray-400"
                              }`}
                            >
                              {size.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Annual Revenue */}
                  <div className="space-y-2.5">
                    <label className="text-[12px] font-semibold text-gray-700">
                      Estimated Annual Revenue Range
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_REVENUE_RANGES.map((rev) => {
                        const isSelected = formConfig.revenueRanges.includes(rev);
                        return (
                          <button
                            key={rev}
                            type="button"
                            onClick={() => toggleArrayItem("revenueRanges", rev)}
                            className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all cursor-pointer border ${
                              isSelected
                                ? "border-[#09232D] bg-[#09232D] text-white"
                                : "border-gray-200 bg-[#F6F6F6] text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            {rev}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Target Territories / Hubs */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
                        <MapPin size={15} className="text-gray-400" />
                        Target Geographic Hubs & Territories
                        <span className="text-red-500 font-bold" aria-hidden="true">*</span>
                      </label>
                      <span className="text-[11px] text-gray-400">
                        {formConfig.territories.length} hubs
                      </span>
                    </div>
                    {showTerritoryError && (
                      <p className="text-[11px] font-medium text-red-600">
                        Pick at least one country or city from the catalog.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_TERRITORIES.map((terr) => {
                        const isSelected = formConfig.territories.includes(terr);
                        return (
                          <button
                            key={terr}
                            type="button"
                            onClick={() => toggleArrayItem("territories", terr)}
                            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#09232D] text-white"
                                : "bg-[#f3f4f6] text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {isSelected && <Check size={12} />}
                            {terr}
                          </button>
                        );
                      })}
                      {formConfig.territories
                        .filter((terr) => !AVAILABLE_TERRITORIES.includes(terr))
                        .map((terr) => (
                          <button
                            key={terr}
                            type="button"
                            onClick={() => toggleArrayItem("territories", terr)}
                            className="flex items-center gap-1 rounded-full bg-[#09232D] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer"
                          >
                            <Check size={12} />
                            {terr}
                            <X size={12} className="text-white/60" />
                          </button>
                        ))}
                    </div>
                    <div className="relative space-y-1 pt-1">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customTerritoryInput}
                          onChange={(e) => handleTerritorySearchChange(e.target.value)}
                          placeholder="Search countries or cities (e.g. Germany, Lagos)…"
                          className="flex-1 rounded-xl border border-gray-200 bg-[#F6F6F6] px-3.5 py-2 text-[12px] text-[#09232D] outline-none placeholder:text-gray-400 focus:border-[#09232D]/30 focus:bg-white"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomTerritory}
                          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                      {(geoSearchLoading || geoSuggestions.length > 0) && (
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                          {geoSearchLoading && geoSuggestions.length === 0 ? (
                            <p className="px-3 py-2 text-[11px] text-gray-500">Searching…</p>
                          ) : (
                            geoSuggestions.map((place) => (
                              <button
                                key={`${place.type}-${place.label}`}
                                type="button"
                                onClick={() => handleSelectGeoPlace(place.label)}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-[#09232D] hover:bg-[#09232D]/5"
                              >
                                <span>{place.label}</span>
                                <span className="text-[10px] uppercase text-gray-400">{place.type}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      <p className="text-[10px] text-gray-500">
                        Only catalog countries and cities can be added. Each selected country is searched.
                      </p>
                    </div>
                  </div>

                  {/* Decision Makers & Roles */}
                  <div className="space-y-2.5">
                    <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
                      <Briefcase size={15} className="text-gray-400" />
                      Target Decision Maker Titles / Roles
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_DECISION_MAKERS.map((role) => {
                        const isSelected = formConfig.decisionMakers.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => toggleArrayItem("decisionMakers", role)}
                            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#09232D] text-white"
                                : "bg-[#f3f4f6] text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {role}
                          </button>
                        );
                      })}
                      {formConfig.decisionMakers
                        .filter((role) => !AVAILABLE_DECISION_MAKERS.includes(role))
                        .map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => toggleArrayItem("decisionMakers", role)}
                            className="flex items-center gap-1.5 rounded-full bg-[#09232D] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer"
                          >
                            {role}
                            <X size={12} className="text-white/60" />
                          </button>
                        ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={customRoleInput}
                        onChange={(e) => setCustomRoleInput(e.target.value)}
                        placeholder="Add custom persona / title..."
                        className="flex-1 rounded-xl border border-gray-200 bg-[#F6F6F6] px-3.5 py-2 text-[12px] text-[#09232D] outline-none placeholder:text-gray-400 focus:border-[#09232D]/30 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomRole}
                        className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Events to watch for */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
                        <Layers size={15} className="text-gray-400" />
                        Events to watch for
                      </label>
                      <span className="text-[11px] text-gray-400">
                        {(formConfig.signalTypePacks ?? []).length} selected
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-snug">
                      Social Listening searches each selected event type with a source URL and date. Core Buyer Signals is on by default. Clear every pack to turn discrete detection off.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_SIGNAL_TYPE_PACKS.map((pack) => {
                        const isSelected = (formConfig.signalTypePacks ?? []).includes(pack.value);
                        return (
                          <button
                            key={pack.value}
                            type="button"
                            title={pack.description}
                            onClick={() => toggleArrayItem("signalTypePacks", pack.value)}
                            className={`group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#09232D] text-white shadow-xs"
                                : "bg-[#f3f4f6] text-gray-600 hover:bg-gray-200/80 hover:text-gray-900"
                            }`}
                          >
                            {isSelected ? (
                              <Check size={12} className="stroke-[3]" />
                            ) : (
                              <Plus size={12} className="text-gray-400 group-hover:text-gray-600" />
                            )}
                            {pack.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* What we search for */}
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between gap-2 text-[12px] font-semibold text-gray-700">
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={14} className="text-amber-500" />
                        <span>What kind of opportunity are you looking for?</span>
                        <span className="text-red-500 font-bold" aria-hidden="true">*</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={suggestBrief.isPending}
                          onClick={() =>
                            handleSuggestBrief((formConfig.customPrompt ?? "").trim() ? "improve" : "generate")
                          }
                          className="inline-flex items-center gap-1 rounded-full border border-[#09232D]/15 bg-white px-2 py-0.5 text-[9px] font-semibold text-[#09232D] transition hover:bg-[#09232D]/5 disabled:opacity-50"
                        >
                          {suggestBrief.isPending ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Sparkles size={10} className="text-amber-500" />
                          )}
                          {(formConfig.customPrompt ?? "").trim() ? "Improve" : "Generate"}
                        </button>
                        <button
                          type="button"
                          disabled={suggestBrief.isPending}
                          onClick={() => handleSuggestBrief("regenerate")}
                          className="inline-flex items-center gap-1 rounded-full border border-[#09232D]/15 bg-white px-2 py-0.5 text-[9px] font-semibold text-[#09232D]/70 transition hover:bg-[#09232D]/5 disabled:opacity-50"
                          title="Draft a different phrasing"
                        >
                          <RefreshCw size={10} />
                          Regenerate
                        </button>
                      </span>
                    </label>
                    <textarea
                      rows={4}
                      value={formConfig.customPrompt ?? ""}
                      onChange={(e) => {
                        autoBriefRef.current = "";
                        const next = clampToMaxWords(e.target.value, ICP_BRIEF_MAX_WORDS);
                        setFormConfig((prev) => ({ ...prev, customPrompt: next }));
                      }}
                      onBlur={() =>
                        setTouchedFields((prev) => ({ ...prev, customPrompt: true }))
                      }
                      placeholder="Describe target companies, products, buyer roles, events, or exclusions in concrete terms (e.g. Cold-chain storage providers hiring operations leads; exclude brokerages and consultants)…"
                      className={`w-full rounded-2xl border p-3.5 text-[12px] text-[#09232D] outline-none transition-all placeholder:text-gray-400 leading-relaxed ${
                        showCustomPromptError
                          ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                          : "border-gray-200 bg-[#F6F6F6] focus:border-[#09232D]/40 focus:bg-white focus:ring-2 focus:ring-[#09232D]/10"
                      }`}
                      required
                    />
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <p
                        className={`text-[11px] font-medium ${
                          wordsRemaining(formConfig.customPrompt ?? "") === 0
                            ? "text-amber-700"
                            : "text-gray-500"
                        }`}
                      >
                        {wordsRemaining(formConfig.customPrompt ?? "") === 0
                          ? "40 words is the limit"
                          : `${wordsRemaining(formConfig.customPrompt ?? "")} words left`}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {countWords(formConfig.customPrompt ?? "")}/{ICP_BRIEF_MAX_WORDS} words
                      </p>
                    </div>
                    {showCustomPromptError && (
                      <p className="mt-1 text-[11px] font-medium text-red-600">
                        Please specify what kind of opportunity you are looking for.
                      </p>
                    )}
                    {briefKeywords.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {briefKeywords.map((keyword) => (
                          <button
                            key={keyword}
                            type="button"
                            onClick={() => insertBriefKeyword(keyword)}
                            className="rounded-full border border-[#d7d7d7] bg-[#f8f8f8] px-2 py-0.5 text-[9px] font-medium text-[#09232d]/75 transition hover:bg-[#09232d]/5"
                          >
                            + {keyword}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-[11px] leading-snug text-gray-500">
                      Use keywords (products, buyers, places you sell into). Do not write a definition like “Industries specialize in…”. Geographic hubs above also locate the search, then reject other countries.
                    </p>
                    {( /industries specialize/i.test(formConfig.customPrompt ?? "") ||
                    ((formConfig.description ?? "").trim() !== "" &&
                      (formConfig.customPrompt ?? "").trim() === (formConfig.description ?? "").trim()) ) ? (
                      <p className="text-[11px] leading-snug text-amber-700">
                        This reads like a profile blurb. Search works better with products and buyers than a definition of the industry.
                      </p>
                    ) : null}
                  </div>

                  {/* Live search brief preview */}
                  <div className="rounded-2xl border border-[#09232D]/10 bg-[#09232D]/[0.03] px-3.5 py-3">
                    <p className="text-[11px] font-semibold text-[#09232D]">
                      When you ask for leads, we will search:
                    </p>
                    <ul className="mt-1 space-y-1">
                      {composeIcpSearchQueries({
                        customPrompt: formConfig.customPrompt ?? "",
                        description: formConfig.description,
                        industries: formConfig.industries,
                      }).map((q) => (
                        <li key={q} className="text-[12px] leading-snug text-[#09232D]/85">
                          “{q}”
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2.5 text-[11px] font-semibold text-[#09232D]">
                      Then qualify with:
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-gray-600">
                      {composeIcpQualifySummary({
                        industries: formConfig.industries,
                        territories: formConfig.territories,
                        companySizes: formConfig.companySizes,
                        revenueRanges: formConfig.revenueRanges,
                      })}
                    </p>
                    <p className="mt-2 text-[10px] leading-snug text-gray-500">
                      Tip: name products, buyers, and exclusions in “What we search for” — that text drives discovery when you ask for leads.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: SCORING & AUTOMATION */}
              {activeTab === "scoring" && (
                <div className="space-y-6">
                  {/* Minimum Score Threshold Slider */}
                  <div className="rounded-2xl border border-gray-200 bg-[#FBFBFB] p-4.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[13px] font-bold text-[#09232D]">
                          Minimum ICP Match Threshold
                        </span>
                        <p className="text-[11px] text-gray-500">
                          60 is a typical first-batch bar; 75 is strict. Leads below this score are still shown when you ask directly.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-1 text-white shadow-xs">
                        <Sparkles size={13} />
                        <span className="text-[13px] font-bold">
                          {formConfig.minMatchScore}%
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <input
                        type="range"
                        min="50"
                        max="95"
                        step="5"
                        value={formConfig.minMatchScore}
                        onChange={(e) =>
                          setFormConfig((prev) => ({
                            ...prev,
                            minMatchScore: Number(e.target.value),
                          }))
                        }
                        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-[#09232D]"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 font-medium px-1">
                        <span>50% (Broad reach)</span>
                        <span>60% (Typical)</span>
                        <span>95% (Strict match)</span>
                      </div>
                    </div>
                  </div>

                  {/* Automation Toggles */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-3.5">
                      <div className="pr-4">
                        <span className="text-[13px] font-bold text-[#09232D]">
                          Auto-Push Qualified to CRM Pipeline
                        </span>
                        <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
                          Automatically sync discovered prospects that exceed match threshold to CRM.
                        </p>
                      </div>
                      <Toggle
                        enabled={formConfig.autoSyncCrm}
                        onToggle={() =>
                          setFormConfig((prev) => ({
                            ...prev,
                            autoSyncCrm: !prev.autoSyncCrm,
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-3.5">
                      <div className="pr-4">
                        <span className="text-[13px] font-bold text-[#09232D]">
                          Auto-Enrich Phone & Decision Maker Emails
                        </span>
                        <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
                          Extract direct contact info from verified registry & LinkedIn indexes.
                        </p>
                      </div>
                      <Toggle
                        enabled={formConfig.enrichContactDetails}
                        onToggle={() =>
                          setFormConfig((prev) => ({
                            ...prev,
                            enrichContactDetails: !prev.enrichContactDetails,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </form>

            {/* Form Footer Bar */}
            <div className="border-t border-gray-100 bg-[#fbfbfb] px-6 py-4 flex items-center justify-between shrink-0">
              {profiles.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setHasAttemptedSubmit(false);
                    setTouchedFields({});
                    setViewMode("list");
                  }}
                  className="text-[12px] font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setHasAttemptedSubmit(false);
                    setTouchedFields({});
                    setFormConfig(BLANK_ICP_CONFIG);
                  }}
                  className="text-[12px] font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                >
                  Clear Fields
                </button>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  form="icp-builder-form"
                  disabled={isSavingForm || isStrengthening}
                  aria-disabled={!isFormValid}
                  onClick={(e) => {
                    if (!isFormValid) {
                      e.preventDefault();
                      setHasAttemptedSubmit(true);
                      setActiveTab("criteria");
                      if (!isProfileNameValid) {
                        toast.error("ICP Profile Name is required.");
                      } else if (!isDescriptionValid) {
                        toast.error("Description / Target Objective is required.");
                      } else if (!isCustomPromptValid) {
                        toast.error("What kind of opportunity you are looking for is required.");
                      } else if (!isTerritoryValid) {
                        toast.error("Pick at least one country or city from the catalog.");
                      }
                    }
                  }}
                  className={`group flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition-all ${
                    !isFormValid
                      ? "bg-gray-400 cursor-not-allowed opacity-60 shadow-none"
                      : "bg-gradient-to-r from-[#09232D] via-[#0E3D4E] to-[#0A2632] shadow-md hover:shadow-lg hover:brightness-110 cursor-pointer"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <Sparkles size={15} className={`text-[#38BDF8] transition-transform ${isFormValid ? "group-hover:rotate-12" : ""}`} />
                  {isSavingForm
                    ? "Saving…"
                    : editingProfileId
                      ? "Save Changes"
                      : "Save & Activate ICP"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
