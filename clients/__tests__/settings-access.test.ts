import { describe, expect, it } from "vitest";
import type { SettingsSectionDef } from "@/hooks/use-settings-access";

function visibleSectionIds(sections: SettingsSectionDef[]): string[] {
  return sections.map((section) => section.id);
}

function buildSectionsForRole(role: string | null): SettingsSectionDef[] {
  const MANAGEMENT_ROLES = new Set(["owner", "admin", "supervisor"]);
  const BILLING_MANAGE_ROLES = new Set(["owner", "admin"]);
  const isAgent = role === "agent";
  const isManagement = role != null && MANAGEMENT_ROLES.has(role);
  const canManageBilling = role != null && BILLING_MANAGE_ROLES.has(role);
  const canEditOrg = role === "owner" || role === "admin" || role === "supervisor";

  const defs: SettingsSectionDef[] = [
    { id: "profile", label: "Profile", scope: "personal", description: "", canView: true, canEdit: true },
    { id: "notifications", label: "Notifications", scope: "personal", description: "", canView: true, canEdit: true },
    { id: "calendar", label: "Calendar", scope: "personal", description: "", canView: true, canEdit: true },
    { id: "email-accounts", label: "Email Accounts", scope: "personal", description: "", canView: true, canEdit: true },
    { id: "security", label: "Security", scope: "personal", description: "", canView: true, canEdit: false },
    { id: "organization", label: "Organization", scope: "organization", description: "", canView: isManagement || isAgent, canEdit: canEditOrg },
    { id: "crm", label: "CRM", scope: "organization", description: "", canView: isManagement, canEdit: canEditOrg },
    { id: "workforce", label: "Workforce", scope: "organization", description: "", canView: isManagement, canEdit: canEditOrg },
    { id: "payroll", label: "Payroll", scope: "organization", description: "", canView: isManagement, canEdit: role === "owner" || role === "admin" },
    { id: "meetings", label: "Meetings", scope: "organization", description: "", canView: isManagement, canEdit: canEditOrg },
    { id: "field-ops", label: "Field Ops", scope: "organization", description: "", canView: isManagement, canEdit: canEditOrg },
    { id: "billing", label: "Billing", scope: "billing", description: "", canView: isManagement, canEdit: canManageBilling },
  ];

  return defs.filter((section) => section.canView);
}

describe("settings access matrix", () => {
  it("shows only personal sections for agents", () => {
    const ids = visibleSectionIds(buildSectionsForRole("agent"));
    expect(ids).toEqual(["profile", "notifications", "calendar", "email-accounts", "security", "organization"]);
    expect(ids).not.toContain("billing");
    expect(ids).not.toContain("crm");
  });

  it("shows billing read-only for supervisors", () => {
    const sections = buildSectionsForRole("supervisor");
    const billing = sections.find((section) => section.id === "billing");
    expect(billing?.canView).toBe(true);
    expect(billing?.canEdit).toBe(false);
  });

  it("allows owners to manage billing", () => {
    const sections = buildSectionsForRole("owner");
    const billing = sections.find((section) => section.id === "billing");
    expect(billing?.canEdit).toBe(true);
  });
});
