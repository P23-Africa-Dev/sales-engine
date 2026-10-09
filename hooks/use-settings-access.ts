"use client";

import { useMemo } from "react";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";

export type SettingsScope = "personal" | "organization" | "billing";

export type SettingsSectionId =
  | "profile"
  | "notifications"
  | "calendar"
  | "email-accounts"
  | "security"
  | "organization"
  | "zones"
  | "crm"
  | "workforce"
  | "user-management"
  | "payroll"
  | "meetings"
  | "field-ops"
  | "drive"
  | "billing"
  | "map-credits";

export type SettingsSectionDef = {
  id: SettingsSectionId;
  label: string;
  scope: SettingsScope;
  description: string;
  canView: boolean;
  canEdit: boolean;
};

const MANAGEMENT_ROLES = new Set(["owner", "admin", "supervisor"]);
const BILLING_MANAGE_ROLES = new Set(["owner", "admin"]);
const USER_MANAGEMENT_ROLES = new Set(["owner", "admin"]);

function canEditOrg(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "supervisor";
}

export function useSettingsAccess() {
  const user = useAuthStore((s) => s.user);
  const { role, apiCompanyId: companyId } = getActiveCompanyContext(user);
  const isAgent = role === "agent";
  const isManagement = role != null && MANAGEMENT_ROLES.has(role);
  const canManageBilling = role != null && BILLING_MANAGE_ROLES.has(role);
  const basePath = isAgent ? "/agent" : "";

  const sections = useMemo((): SettingsSectionDef[] => {
    const defs: SettingsSectionDef[] = [
      {
        id: "profile",
        label: "Profile",
        scope: "personal",
        description: "Your name, avatar, and contact details",
        canView: true,
        canEdit: true,
      },
      {
        id: "notifications",
        label: "Notifications",
        scope: "personal",
        description: "Email, in app, and quiet hours",
        canView: true,
        canEdit: true,
      },
      {
        id: "calendar",
        label: "Calendar",
        scope: "personal",
        description: "Connect Google Calendar for meetings and scheduling",
        canView: true,
        canEdit: true,
      },
      {
        id: "email-accounts",
        label: "Email Accounts",
        scope: "personal",
        description: "Connect Google or Microsoft for CRM email",
        canView: true,
        canEdit: true,
      },
      {
        id: "security",
        label: "Security",
        scope: "personal",
        description: "Account verification and access",
        canView: true,
        canEdit: false,
      },
      {
        id: "organization",
        label: "Organization",
        scope: "organization",
        description: "Company profile and team",
        canView: isManagement || isAgent,
        canEdit: canEditOrg(role),
      },
      {
        id: "zones",
        label: "Zones",
        scope: "organization",
        description: "Coverage areas for agent assignment",
        canView: isManagement,
        canEdit: canEditOrg(role),
      },
      {
        id: "crm",
        label: "CRM",
        scope: "organization",
        description: "Pipelines, stages, and lead labels",
        canView: isManagement,
        canEdit: canEditOrg(role),
      },
      {
        id: "workforce",
        label: "Workforce & Attendance",
        scope: "organization",
        description: "Working hours and clock in rules",
        canView: isManagement,
        canEdit: canEditOrg(role),
      },
      {
        id: "user-management",
        label: "User Management",
        scope: "organization",
        description: "Supervisor privileges and audit log",
        canView: role != null && USER_MANAGEMENT_ROLES.has(role),
        canEdit: role != null && USER_MANAGEMENT_ROLES.has(role),
      },
      {
        id: "payroll",
        label: "Payroll",
        scope: "organization",
        description: "Default salary and commission settings",
        canView: isManagement,
        canEdit: role === "owner" || role === "admin",
      },
      {
        id: "meetings",
        label: "Meetings & Integrations",
        scope: "organization",
        description: "Organization Google Calendar and meeting defaults",
        canView: isManagement,
        canEdit: canEditOrg(role),
      },
      {
        id: "field-ops",
        label: "Field Operations",
        scope: "organization",
        description: "Default task proof and visit rules",
        canView: isManagement,
        canEdit: canEditOrg(role),
      },
      {
        id: "drive",
        label: "Company Drive",
        scope: "organization",
        description: "Shared storage and file sharing",
        canView: true,
        canEdit: canEditOrg(role),
      },
      {
        id: "billing",
        label: "Billing",
        scope: "billing",
        description: "Plan, seats, and payment methods",
        canView: isManagement,
        canEdit: canManageBilling,
      },
      {
        id: "map-credits",
        label: "Map Credits",
        scope: "billing",
        description: "Google Maps usage credits and top ups",
        canView: isManagement,
        canEdit: canManageBilling,
      },
    ];

    return defs.filter((section) => section.canView);
  }, [isAgent, isManagement, canManageBilling, role]);

  const sectionsByScope = useMemo(() => {
    const grouped: Record<SettingsScope, SettingsSectionDef[]> = {
      personal: [],
      organization: [],
      billing: [],
    };
    for (const section of sections) {
      grouped[section.scope].push(section);
    }
    return grouped;
  }, [sections]);

  const defaultSectionId = sections[0]?.id ?? "profile";

  return {
    role,
    companyId,
    basePath,
    isAgent,
    isManagement,
    canManageBilling,
    sections,
    sectionsByScope,
    defaultSectionId,
  };
}

export function isValidSettingsSection(
  sectionId: string,
  sections: SettingsSectionDef[],
): sectionId is SettingsSectionId {
  return sections.some((section) => section.id === sectionId);
}
