"use client";

import { useAuthorizeEmailAccountOAuth, useEmailAccounts } from "@/hooks/use-email-accounts";
import { EMAIL_ACCOUNTS_KEYS } from "@/hooks/use-email-accounts";
import { getActiveCompanyContext } from "@/lib/company-context";
import { toastEmailOAuthResult } from "@/lib/email/oauth-result-toast";
import { useAuthStore } from "@/store/auth";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Link2, Mail } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

type EmailConnectionBannerProps = {
    companyId?: number | string;
};

function openAuthorizationPopup(authorizationUrl: string, popupName: string) {
    const popup = window.open(authorizationUrl, popupName, "width=560,height=720");
    if (!popup) {
        window.location.href = authorizationUrl;
        return;
    }
    toast.info("Complete sign in in the popup. Connection status will update automatically.");
}

export function EmailConnectionBanner({ companyId }: EmailConnectionBannerProps) {
    const user = useAuthStore((s) => s.user);
    const context = getActiveCompanyContext(user);
    const resolvedCompanyId = companyId ?? context?.apiCompanyId ?? undefined;
    const isAgent = context?.role === "agent";
    const settingsHref = `${isAgent ? "/agent" : ""}/settings/email-accounts`;

    const queryClient = useQueryClient();
    const accountsQuery = useEmailAccounts(resolvedCompanyId);
    const authorizeMutation = useAuthorizeEmailAccountOAuth();

    const accounts = accountsQuery.data ?? [];
    const activeAccounts = accounts.filter((a) => a.status === "active");
    const hasActive = activeAccounts.length > 0;
    const defaultAccount =
        activeAccounts.find((a) => a.is_default) ?? activeAccounts[0] ?? null;
    const needsAttention = accounts.some(
        (a) => a.status === "error" || a.status === "expired",
    );

    const refreshAccounts = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: EMAIL_ACCOUNTS_KEYS.all });
    }, [queryClient]);

    useEffect(() => {
        const handleOAuthMessage = (event: MessageEvent) => {
            const payload = event.data as {
                type?: string;
                success?: boolean;
                message?: string;
                provider?: string;
            };
            if (!payload || payload.type !== "email-account-oauth") return;

            toastEmailOAuthResult(payload);
            if (payload.success) {
                refreshAccounts();
            }
        };

        window.addEventListener("message", handleOAuthMessage);
        return () => window.removeEventListener("message", handleOAuthMessage);
    }, [refreshAccounts]);

    const handleQuickConnectGoogle = () => {
        if (!resolvedCompanyId) {
            toast.error("Company context is required.");
            return;
        }

        authorizeMutation.mutate(
            { provider: "google", companyId: resolvedCompanyId, forceAccountPicker: true },
            {
                onSuccess: (result) => {
                    openAuthorizationPopup(result.data.authorization_url, "email-oauth-google");
                },
                onError: (err: Error) => {
                    toast.error(err.message || "Failed to start Google sign in.");
                },
            },
        );
    };

    if (accountsQuery.isLoading) {
        return null;
    }

    if (hasActive && defaultAccount) {
        return (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-white border border-emerald-100 flex items-center justify-center shrink-0">
                        <Mail size={16} className="text-emerald-700" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-emerald-900">
                            Email connected
                        </p>
                        <p className="text-[11px] text-emerald-800/80 truncate">
                            Sending as {defaultAccount.display_name || defaultAccount.email}
                            {activeAccounts.length > 1 ? ` · ${activeAccounts.length} accounts` : ""}
                        </p>
                    </div>
                </div>
                <Link
                    href={settingsHref}
                    className="text-[11px] font-semibold text-emerald-800 hover:underline whitespace-nowrap"
                >
                    Manage accounts
                </Link>
            </div>
        );
    }

    if (needsAttention) {
        return (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3">
                <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-white border border-amber-100 flex items-center justify-center shrink-0">
                        <AlertCircle size={16} className="text-amber-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-amber-900">
                            Email account needs attention
                        </p>
                        <p className="text-[11px] text-amber-800/80">
                            Reconnect an expired or failed account to continue sending CRM emails.
                        </p>
                    </div>
                </div>
                <Link
                    href={settingsHref}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B1215] text-white text-[12px] font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                    <Link2 size={14} />
                    Reconnect
                </Link>
            </div>
        );
    }

    return (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3">
            <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-white border border-amber-100 flex items-center justify-center shrink-0">
                    <AlertCircle size={16} className="text-amber-600" />
                </div>
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-amber-900">
                        Connect an email account
                    </p>
                    <p className="text-[11px] text-amber-800/80">
                        Connect Google, Microsoft, Zoho, or IMAP/SMTP to send and receive lead emails.
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    onClick={handleQuickConnectGoogle}
                    disabled={authorizeMutation.isPending}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B1215] text-white text-[12px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                >
                    <Link2 size={14} />
                    Connect Google
                </button>
                <Link
                    href={settingsHref}
                    className="text-[11px] font-semibold text-amber-900 hover:underline whitespace-nowrap px-2"
                >
                    More options
                </Link>
            </div>
        </div>
    );
}
