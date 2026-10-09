"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/sample";
import {
  useSettingsAccess,
  type SettingsScope,
  type SettingsSectionId,
  isValidSettingsSection,
} from "@/hooks/use-settings-access";
import { ProfileSummaryCard } from "@/components/settings/personal/profile-summary-card";
import { NotificationsPanel } from "@/components/settings/personal/notifications-panel";
import { CalendarUserPanel } from "@/components/settings/personal/calendar-user-panel";
import { EmailAccountsPanel } from "@/components/settings/personal/email-accounts-panel";
import { SecurityPanel } from "@/components/settings/personal/security-panel";
import { OrgProfilePanel } from "@/components/settings/organization/org-profile-panel";
import { ZonesSettingsPanel } from "@/components/settings/organization/zones-settings-panel";
import { CrmSettingsPanel } from "@/components/settings/organization/crm-settings-panel";
import { AttendanceSettingsPanel } from "@/components/settings/organization/attendance-settings-panel";
import { UserManagementPanel } from "@/components/settings/organization/user-management-panel";
import { PayrollSettingsPanel } from "@/components/settings/organization/payroll-settings-panel";
import { MeetingsIntegrationsPanel } from "@/components/settings/organization/meetings-integrations-panel";
import { FieldOpsDefaultsPanel } from "@/components/settings/organization/field-ops-defaults-panel";
import { DriveSettingsPanel } from "@/components/settings/organization/drive-settings-panel";
import { BillingSettingsPanel } from "@/components/settings/billing/billing-settings-panel";
import { MapCreditsPanel } from "@/components/settings/organization/map-credits-panel";

const SCOPE_LABELS: Record<SettingsScope, string> = {
  personal: "Personal",
  organization: "Organization",
  billing: "Billing",
};

function SectionContent({ sectionId }: { sectionId: SettingsSectionId }) {
  switch (sectionId) {
    case "profile":
      return <ProfileSummaryCard />;
    case "notifications":
      return <NotificationsPanel />;
    case "calendar":
      return <CalendarUserPanel />;
    case "email-accounts":
      return <EmailAccountsPanel />;
    case "security":
      return <SecurityPanel />;
    case "organization":
      return <OrgProfilePanel />;
    case "zones":
      return <ZonesSettingsPanel />;
    case "crm":
      return <CrmSettingsPanel />;
    case "workforce":
      return <AttendanceSettingsPanel />;
    case "user-management":
      return <UserManagementPanel />;
    case "payroll":
      return <PayrollSettingsPanel />;
    case "meetings":
      return <MeetingsIntegrationsPanel />;
    case "field-ops":
      return <FieldOpsDefaultsPanel />;
    case "drive":
      return <DriveSettingsPanel />;
    case "billing":
      return <BillingSettingsPanel />;
    case "map-credits":
      return <MapCreditsPanel />;
    default:
      return null;
  }
}

export function SettingsShell({ activeSection }: { activeSection?: string }) {
  const router = useRouter();
  const {
    basePath,
    sections,
    sectionsByScope,
    defaultSectionId,
  } = useSettingsAccess();

  const resolvedSection = isValidSettingsSection(activeSection ?? "", sections)
    ? activeSection
    : defaultSectionId;

  const activeDef = sections.find((s) => s.id === resolvedSection) ?? sections[0];

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[#f4f7f8]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-dash-dark">Settings</h1>
          <p className="text-[14px] text-gray-500 mt-1">
            Manage your account, organization defaults, and billing.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="lg:w-64 shrink-0">
            <nav className="bg-white rounded-2xl border border-black/5 shadow-sm p-3 space-y-4">
              {(["personal", "organization", "billing"] as SettingsScope[]).map((scope) => {
                const scopeSections = sectionsByScope[scope];
                if (scopeSections.length === 0) return null;

                return (
                  <div key={scope}>
                    <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {SCOPE_LABELS[scope]}
                    </p>
                    <ul className="space-y-0.5">
                      {scopeSections.map((section) => {
                        const href = `${basePath}/settings/${section.id}`;
                        const isActive = section.id === resolvedSection;
                        return (
                          <li key={section.id}>
                            <Link
                              href={href}
                              className={cn(
                                "flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors",
                                isActive
                                  ? "bg-dash-dark text-white"
                                  : "text-gray-600 hover:bg-gray-50",
                              )}
                            >
                              {section.label}
                              {isActive && <ChevronRight size={14} />}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>
          </aside>

          <div className="flex-1 min-w-0 space-y-4">
            {activeDef && (
              <>
                <div className="lg:hidden">
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                    Section
                  </label>
                  <select
                    value={resolvedSection}
                    onChange={(e) => router.push(`${basePath}/settings/${e.target.value}`)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] bg-white"
                  >
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.label}
                      </option>
                    ))}
                  </select>
                </div>
                <SectionContent sectionId={activeDef.id} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
