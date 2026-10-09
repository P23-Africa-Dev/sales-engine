export type AgentPresenceApi = {
  is_session_online: boolean;
  is_map_active: boolean;
  last_seen_at?: string | null;
  last_session_at?: string | null;
  active_task_id?: number | null;
  active_task_title?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type AgentPresence = {
  isSessionOnline: boolean;
  isMapActive: boolean;
  lastSeenAt?: string | null;
  lastSessionAt?: string | null;
  activeTaskId?: number | null;
  activeTaskTitle?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type AgentAccountState = {
  onboardingStatus?: "active" | "pending_onboarding" | "inactive" | string | null;
  isActive?: boolean;
};

export type AgentPresenceLabels = {
  badgeLabel: string;
  subtextLabel: string;
  isMapActive: boolean;
  isSessionOnline: boolean;
};

export function mapApiPresence(presence?: AgentPresenceApi | null): AgentPresence {
  return {
    isSessionOnline: Boolean(presence?.is_session_online),
    isMapActive: Boolean(presence?.is_map_active),
    lastSeenAt: presence?.last_seen_at ?? null,
    lastSessionAt: presence?.last_session_at ?? null,
    activeTaskId: presence?.active_task_id ?? null,
    activeTaskTitle: presence?.active_task_title ?? null,
    latitude: presence?.latitude ?? null,
    longitude: presence?.longitude ?? null,
  };
}

function formatLastSeen(iso?: string | null): string {
  if (!iso) {
    return "Offline";
  }

  const seenAt = new Date(iso);
  if (Number.isNaN(seenAt.getTime())) {
    return "Offline";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - seenAt.getTime()) / 1000));
  if (diffSeconds < 60) {
    return "Last seen just now";
  }
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `Last seen ${minutes} min ago`;
  }
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `Last seen ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(diffSeconds / 86400);
  return `Last seen ${days} day${days === 1 ? "" : "s"} ago`;
}

export function getAgentPresenceLabels(
  presence: AgentPresence | undefined,
  accountState: AgentAccountState,
): AgentPresenceLabels {
  const onboardingStatus = accountState.onboardingStatus ?? "active";
  const isAccountActive = accountState.isActive !== false;

  if (onboardingStatus === "pending_onboarding") {
    return {
      badgeLabel: "Pending onboarding",
      subtextLabel: "Pending onboarding",
      isMapActive: false,
      isSessionOnline: false,
    };
  }

  if (!isAccountActive || onboardingStatus === "inactive") {
    return {
      badgeLabel: "Inactive",
      subtextLabel: "Offline",
      isMapActive: false,
      isSessionOnline: false,
    };
  }

  const isMapActive = Boolean(presence?.isMapActive);
  const isSessionOnline = Boolean(presence?.isSessionOnline);

  if (isMapActive) {
    return {
      badgeLabel: "Active (View on Map)",
      subtextLabel: isSessionOnline ? "Online" : formatLastSeen(presence?.lastSeenAt),
      isMapActive: true,
      isSessionOnline,
    };
  }

  if (isSessionOnline) {
    return {
      badgeLabel: "Active",
      subtextLabel: "Online",
      isMapActive: false,
      isSessionOnline: true,
    };
  }

  return {
    badgeLabel: "Offline",
    subtextLabel: "Offline",
    isMapActive: false,
    isSessionOnline: false,
  };
}

export function getAgentPresenceBadgeClass(
  labels: Pick<AgentPresenceLabels, "isMapActive" | "isSessionOnline">,
): string {
  if (labels.isMapActive) {
    return "bg-[#2F6C0E] text-white";
  }
  if (labels.isSessionOnline) {
    return "bg-[#2F5E71] text-white";
  }
  return "bg-[#EF7129] text-white";
}

export function getAgentSessionBadgeClass(isSessionOnline: boolean): string {
  return isSessionOnline ? "bg-[#22C55E] text-white" : "bg-gray-200 text-gray-500";
}
