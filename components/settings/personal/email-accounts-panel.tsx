"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import {
  EMAIL_ACCOUNTS_KEYS,
  useAuthorizeEmailAccountOAuth,
  useConnectEmailAccount,
  useDisconnectEmailAccount,
  useEmailAccounts,
  useTestEmailAccountConnection,
  useUpdateEmailAccount,
} from "@/hooks/use-email-accounts";
import { useEmailOAuthReturnToast } from "@/hooks/use-email-oauth-return-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  IMAP_SMTP_UNSUPPORTED_MESSAGE,
  isImapSmtpConnectionAvailable,
} from "@/lib/email/imap-smtp-availability";
import { toastEmailOAuthResult } from "@/lib/email/oauth-result-toast";
import type {
  EmailAccountConnectionTest,
  EmailAccountItem,
  EmailAccountProvider,
} from "@/lib/api/email-accounts";

const PROVIDER_LABELS: Record<EmailAccountProvider, string> = {
  google: "Google / Gmail",
  microsoft: "Microsoft 365",
  zoho: "Zoho Mail",
  imap_smtp: "IMAP / SMTP",
};

function ProviderMark({ provider }: { provider: EmailAccountProvider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
        <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.8-4.1 2.8-7 0-.7-.1-1.3-.2-1.9H12z" />
        <path fill="#34A853" d="M6.6 14.3l-.8.6-2.5 1.9C5 19.4 8.2 21.3 12 21.3c2.1 0 3.9-.7 5.2-1.9l-3.1-2.4c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8z" />
        <path fill="#4A90E2" d="M3.3 7.2C2.5 8.7 2 10.3 2 12s.5 3.3 1.3 4.8l3.3-2.5c-.2-.6-.3-1.2-.3-1.8s.1-1.3.3-1.8L3.3 7.2z" />
        <path fill="#FBBC05" d="M12 5.7c1.2 0 2.2.4 3.1 1.2l2.3-2.3C15.9 3.1 14.1 2.3 12 2.3 8.2 2.3 5 4.2 3.3 7.2l3.3 2.5C7.6 7.3 9.6 5.7 12 5.7z" />
      </svg>
    );
  }
  if (provider === "microsoft") {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
        <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
        <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
        <path fill="#00A4EF" d="M3 12.5H11.5V21H3z" />
        <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
      </svg>
    );
  }
  if (provider === "zoho") {
    return (
      <span className="text-[10px] font-bold text-emerald-700 tracking-tight">Zo</span>
    );
  }
  return <Globe size={14} className="text-gray-600" />;
}

const PROVIDER_COLORS: Record<EmailAccountProvider, string> = {
  google: "bg-white text-gray-700 border-gray-200",
  microsoft: "bg-white text-gray-700 border-gray-200",
  zoho: "bg-emerald-50 text-emerald-700 border-emerald-200",
  imap_smtp: "bg-gray-50 text-gray-600 border-gray-200",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  error: "bg-red-50 text-red-700 border-red-200",
  disconnected: "bg-gray-50 text-gray-500 border-gray-200",
  expired: "bg-amber-50 text-amber-700 border-amber-200",
};

function openAuthorizationPopup(authorizationUrl: string, popupName: string) {
  const url = (authorizationUrl || "").trim();
  if (!url || !/^https:\/\//i.test(url)) {
    toast.error("Microsoft sign in URL was missing. Please try again.");
    return;
  }

  try {
    const parsed = new URL(url);
    const clientId = parsed.searchParams.get("client_id")?.trim() ?? "";
    if (!clientId) {
      toast.error(
        "Microsoft OAuth is not configured (missing client_id). Ask platform support to set MICROSOFT_MAIL_CLIENT_ID on the API, or use Google instead.",
        { duration: 12000 },
      );
      return;
    }
  } catch {
    toast.error("Microsoft sign in URL was invalid. Please try again.");
    return;
  }

  const popup = window.open(url, popupName, "width=560,height=720");
  if (!popup) {
    window.location.href = url;
    return;
  }
  toast.info("Complete sign in in the popup. This page will update automatically.");
}

function notifyConnectionTest(test?: EmailAccountConnectionTest | null, fallbackSuccess?: string) {
  if (!test || !test.ran) {
    if (fallbackSuccess) toast.success(fallbackSuccess);
    return;
  }

  if (test.ok) {
    toast.success(test.message || "Email connected successfully.");
    return;
  }

  const lines = (test.message || "Email connection failed. Please check your settings and try again.")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  toast.error(lines[0] || "Email connection failed.", {
    description: lines.length > 1 ? lines.slice(1).join(" ") : undefined,
    duration: 10000,
  });
}

function ConnectionIssueBlock({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  const lines = message.split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
      <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-semibold text-red-800">{title}</p>
        {lines.map((line) => (
          <p key={line} className="text-[11px] text-red-700 break-words whitespace-pre-wrap">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-semibold text-gray-400">{label}</label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 pr-10 text-[12px] text-dash-dark placeholder:text-gray-300 outline-none focus:border-dash-dark"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:text-dash-dark hover:bg-gray-50"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

function AccountCard({
  account,
  onSetDefault,
  onDisconnect,
  onTest,
  onReconnect,
  onEdit,
  imapSmtpAvailable,
  isSettingDefault,
  isDisconnecting,
  isTesting,
  isReconnecting,
}: {
  account: EmailAccountItem;
  onSetDefault: () => void;
  onDisconnect: () => void;
  onTest: () => void;
  onReconnect: () => void;
  onEdit: () => void;
  imapSmtpAvailable: boolean;
  isSettingDefault: boolean;
  isDisconnecting: boolean;
  isTesting: boolean;
  isReconnecting: boolean;
}) {
  const isActive = account.status === "active";
  const isError = account.status === "error";
  const isExpired = account.status === "expired";
  const isImap = account.provider === "imap_smtp";
  const canOAuthReconnect = !isImap;
  const canEditImap = isImap && imapSmtpAvailable;
  const canTest = account.status !== "disconnected" && (!isImap || imapSmtpAvailable);
  const showImapUnsupported = isImap && !imapSmtpAvailable;

  return (
    <div
      className={`flex flex-col gap-3 p-4 rounded-xl border transition-colors ${
        account.is_default
          ? "border-dash-dark/20 bg-dash-dark/5"
          : isError || isExpired || showImapUnsupported
            ? "border-amber-100 bg-white"
            : "border-gray-100 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center border shrink-0 ${
              PROVIDER_COLORS[account.provider] || "bg-gray-100 text-gray-600 border-gray-200"
            }`}
          >
            <ProviderMark provider={account.provider} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14px] font-bold text-dash-dark truncate">
                {account.display_name || account.email}
              </p>
              {account.is_default && (
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-dash-dark text-white shrink-0">
                  Default
                </span>
              )}
            </div>
            <p className="text-[12px] text-gray-500 truncate">{account.email}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {PROVIDER_LABELS[account.provider]}
              {isImap && account.smtp_host ? ` · ${account.smtp_host}` : ""}
            </p>
          </div>
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${
            showImapUnsupported
              ? STATUS_COLORS.error
              : STATUS_COLORS[account.status] || STATUS_COLORS.disconnected
          }`}
        >
          {showImapUnsupported ? "unsupported" : account.status}
        </span>
      </div>

      {showImapUnsupported && (
        <ConnectionIssueBlock
          title="IMAP/SMTP unavailable"
          message={`${IMAP_SMTP_UNSUPPORTED_MESSAGE} You can remove this account and connect Google or Microsoft instead.`}
        />
      )}

      {!showImapUnsupported && (isError || isExpired) && account.last_error_message && (
        <ConnectionIssueBlock title="Validation failed" message={account.last_error_message} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {!account.is_default && isActive && !showImapUnsupported && (
          <button
            type="button"
            onClick={onSetDefault}
            disabled={isSettingDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-gray-600 hover:bg-gray-50 border border-gray-100 transition-colors disabled:opacity-50"
          >
            {isSettingDefault ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
            Set default
          </button>
        )}
        {canTest && (
          <button
            type="button"
            onClick={onTest}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-gray-600 hover:bg-gray-50 border border-gray-100 transition-colors disabled:opacity-50"
          >
            {isTesting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Test
          </button>
        )}
        {canEditImap && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-dash-dark hover:bg-gray-50 border border-gray-100 transition-colors"
          >
            <Pencil size={12} />
            Edit
          </button>
        )}
        {canOAuthReconnect && (isError || isExpired || !isActive) && (
          <button
            type="button"
            onClick={onReconnect}
            disabled={isReconnecting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-amber-700 hover:bg-amber-50 border border-amber-100 transition-colors disabled:opacity-50"
          >
            {isReconnecting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Reconnect
          </button>
        )}
        <button
          type="button"
          onClick={onDisconnect}
          disabled={isDisconnecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 border border-red-100 transition-colors disabled:opacity-50 ml-auto"
        >
          {isDisconnecting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Remove
        </button>
      </div>
    </div>
  );
}

function ImapSmtpForm({
  onClose,
  companyId,
  account,
  onSaved,
}: {
  onClose: () => void;
  companyId?: number | string;
  account?: EmailAccountItem | null;
  onSaved?: () => void;
}) {
  const isEdit = !!account;
  const connectMutation = useConnectEmailAccount();
  const updateMutation = useUpdateEmailAccount();
  const [email, setEmail] = useState(account?.email ?? "");
  const [displayName, setDisplayName] = useState(account?.display_name ?? "");
  const [isDefault, setIsDefault] = useState(account?.is_default ?? false);
  const [smtpHost, setSmtpHost] = useState(account?.smtp_host ?? "");
  const [smtpPort, setSmtpPort] = useState(String(account?.smtp_port ?? 587));
  const [smtpEncryption, setSmtpEncryption] = useState(account?.smtp_encryption ?? "tls");
  const [smtpUsername, setSmtpUsername] = useState(account?.smtp_username ?? "");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [imapHost, setImapHost] = useState(account?.imap_host ?? "");
  const [imapPort, setImapPort] = useState(String(account?.imap_port ?? 993));
  const [imapEncryption, setImapEncryption] = useState(account?.imap_encryption ?? "ssl");
  const [imapUsername, setImapUsername] = useState(account?.imap_username ?? "");
  const [imapPassword, setImapPassword] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const isPending = connectMutation.isPending || updateMutation.isPending || isValidating;

  const handleSubmit = () => {
    if (!email.trim() || !smtpHost.trim() || !imapHost.trim()) {
      toast.error("Email, SMTP host, and IMAP host are required.");
      return;
    }
    if (!isEdit && (!smtpPassword.trim() || !imapPassword.trim())) {
      toast.error("SMTP and IMAP passwords are required.");
      return;
    }

    const basePayload = {
      email: email.trim(),
      display_name: displayName.trim() || null,
      is_default: isDefault,
      company_id: companyId ?? undefined,
      smtp_host: smtpHost.trim(),
      smtp_port: Number(smtpPort) || 587,
      smtp_encryption: smtpEncryption,
      smtp_username: smtpUsername.trim() || email.trim(),
      imap_host: imapHost.trim(),
      imap_port: Number(imapPort) || 993,
      imap_encryption: imapEncryption,
      imap_username: imapUsername.trim() || email.trim(),
    };

    const finish = (test?: EmailAccountConnectionTest | null) => {
      setIsValidating(false);
      onClose();
      onSaved?.();
      notifyConnectionTest(
        test,
        isEdit ? "IMAP/SMTP account updated." : "IMAP/SMTP account connected.",
      );
    };

    if (isEdit && account) {
      setIsValidating(true);
      toast.info("Saving settings and validating connection…");
      updateMutation.mutate(
        {
          accountId: account.id,
          payload: {
            ...basePayload,
            smtp_password: smtpPassword.trim() || undefined,
            imap_password: imapPassword.trim() || undefined,
          },
        },
        {
          onSuccess: (result) => finish(result.data.connection_test),
          onError: (err: Error) => {
            setIsValidating(false);
            toast.error(getApiErrorMessage(err, "Failed to update email account."));
          },
        },
      );
      return;
    }

    setIsValidating(true);
    toast.info("Saving account and validating connection…");
    connectMutation.mutate(
      {
        provider: "imap_smtp",
        ...basePayload,
        smtp_password: smtpPassword,
        imap_password: imapPassword,
      },
      {
        onSuccess: (result) => finish(result.data.connection_test),
        onError: (err: Error) => {
          setIsValidating(false);
          toast.error(getApiErrorMessage(err, "Failed to connect email account."));
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-dash-dark">
          {isEdit ? "Edit IMAP / SMTP" : "Configure IMAP / SMTP"}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-gray-400 hover:text-gray-600 font-semibold"
        >
          Cancel
        </button>
      </div>

      {isEdit && account?.last_error_message && (
        <ConnectionIssueBlock title="Last validation issue" message={account.last_error_message} />
      )}

      <div className="space-y-1.5">
        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          Email Address
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full h-11 rounded-xl border border-gray-200 bg-white px-4 text-[13px] text-dash-dark placeholder:text-gray-300 outline-none focus:border-dash-dark transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          Display Name (optional)
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Work Email"
          className="w-full h-11 rounded-xl border border-gray-200 bg-white px-4 text-[13px] text-dash-dark placeholder:text-gray-300 outline-none focus:border-dash-dark transition-colors"
        />
      </div>

      <div className="space-y-4 border border-gray-100 rounded-xl p-4 bg-gray-50/50">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">SMTP (Outgoing)</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-400">Host</label>
            <input
              type="text"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.example.com"
              className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[12px] text-dash-dark placeholder:text-gray-300 outline-none focus:border-dash-dark"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-400">Port</label>
            <input
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="587"
              className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[12px] text-dash-dark placeholder:text-gray-300 outline-none focus:border-dash-dark"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-400">Encryption</label>
            <select
              value={smtpEncryption}
              onChange={(e) => setSmtpEncryption(e.target.value)}
              className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[12px] text-dash-dark outline-none focus:border-dash-dark"
            >
              <option value="tls">TLS</option>
              <option value="ssl">SSL</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-400">Username</label>
            <input
              type="text"
              value={smtpUsername}
              onChange={(e) => setSmtpUsername(e.target.value)}
              placeholder="Defaults to email"
              className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[12px] text-dash-dark placeholder:text-gray-300 outline-none focus:border-dash-dark"
            />
          </div>
        </div>
        <PasswordField
          label={isEdit ? "Password (leave blank to keep current)" : "Password"}
          value={smtpPassword}
          onChange={setSmtpPassword}
          placeholder={isEdit ? "Leave blank to keep current password" : "SMTP password / app password"}
        />

        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider pt-2">IMAP (Incoming)</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-400">Host</label>
            <input
              type="text"
              value={imapHost}
              onChange={(e) => setImapHost(e.target.value)}
              placeholder="imap.example.com"
              className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[12px] text-dash-dark placeholder:text-gray-300 outline-none focus:border-dash-dark"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-400">Port</label>
            <input
              type="number"
              value={imapPort}
              onChange={(e) => setImapPort(e.target.value)}
              placeholder="993"
              className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[12px] text-dash-dark placeholder:text-gray-300 outline-none focus:border-dash-dark"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-400">Encryption</label>
            <select
              value={imapEncryption}
              onChange={(e) => setImapEncryption(e.target.value)}
              className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[12px] text-dash-dark outline-none focus:border-dash-dark"
            >
              <option value="ssl">SSL</option>
              <option value="tls">TLS</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-400">Username</label>
            <input
              type="text"
              value={imapUsername}
              onChange={(e) => setImapUsername(e.target.value)}
              placeholder="Defaults to email"
              className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[12px] text-dash-dark placeholder:text-gray-300 outline-none focus:border-dash-dark"
            />
          </div>
        </div>
        <PasswordField
          label={isEdit ? "Password (leave blank to keep current)" : "Password"}
          value={imapPassword}
          onChange={setImapPassword}
          placeholder={isEdit ? "Leave blank to keep current password" : "IMAP password / app password"}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-dash-dark focus:ring-dash-dark"
        />
        <span className="text-[12px] font-medium text-dash-dark">Set as default sending account</span>
      </label>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
      >
        {isPending ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            {isValidating ? "Validating connection…" : "Saving…"}
          </>
        ) : isEdit ? (
          "Save & Validate"
        ) : (
          "Connect & Validate"
        )}
      </button>
    </div>
  );
}

function ConnectProviderPicker({
  companyId,
  onClose,
  onChooseImap,
  imapSmtpAvailable,
}: {
  companyId?: number | string;
  onClose: () => void;
  onChooseImap: () => void;
  imapSmtpAvailable: boolean;
}) {
  const authorizeMutation = useAuthorizeEmailAccountOAuth();
  const [pendingProvider, setPendingProvider] = useState<Exclude<EmailAccountProvider, "imap_smtp"> | null>(null);

  const handleOAuth = (provider: Exclude<EmailAccountProvider, "imap_smtp">) => {
    if (!companyId) {
      toast.error("Company context is required.");
      return;
    }
    setPendingProvider(provider);
    authorizeMutation.mutate(
      { provider, companyId, forceAccountPicker: true },
      {
        onSuccess: (result) => {
          const url = result.data.authorization_url;
          openAuthorizationPopup(url, `email-oauth-${provider}`);
          setPendingProvider(null);
          onClose();
        },
        onError: (err: Error) => {
          toast.error(getApiErrorMessage(err, `Failed to start ${PROVIDER_LABELS[provider]} sign in.`), {
            duration: 12000,
          });
          setPendingProvider(null);
        },
      },
    );
  };

  const recommendedProviders: Array<"google" | "microsoft"> = ["google", "microsoft"];
  const otherOAuthProviders: Array<"zoho"> = ["zoho"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-dash-dark">Connect Email Account</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-gray-400 hover:text-gray-600 font-semibold"
        >
          Cancel
        </button>
      </div>
      <p className="text-[12px] text-gray-500">
        Recommended: sign in with Google or Microsoft to send and sync CRM emails from your mailbox.
      </p>

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Recommended</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {recommendedProviders.map((provider) => (
            <button
              key={provider}
              type="button"
              onClick={() => handleOAuth(provider)}
              disabled={authorizeMutation.isPending}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dash-dark/20 bg-dash-dark/[0.03] text-left hover:border-dash-dark/40 hover:bg-dash-dark/[0.06] transition-colors disabled:opacity-50"
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${PROVIDER_COLORS[provider]}`}>
                {pendingProvider === provider ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ProviderMark provider={provider} />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[13px] font-semibold text-dash-dark">{PROVIDER_LABELS[provider]}</p>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-dash-dark text-white">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  {provider === "google"
                    ? "Gmail & Google Workspace"
                    : "Outlook & Microsoft 365"}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Other options</p>
        <div className="grid grid-cols-1 gap-2">
          {otherOAuthProviders.map((provider) => (
            <button
              key={provider}
              type="button"
              onClick={() => handleOAuth(provider)}
              disabled={authorizeMutation.isPending}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white text-left hover:border-dash-dark/30 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${PROVIDER_COLORS[provider]}`}>
                {pendingProvider === provider ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ProviderMark provider={provider} />
                )}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-dash-dark">{PROVIDER_LABELS[provider]}</p>
                <p className="text-[11px] text-gray-400">Sign in with OAuth</p>
              </div>
            </button>
          ))}

          {imapSmtpAvailable ? (
            <button
              type="button"
              onClick={onChooseImap}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white text-left hover:border-dash-dark/30 hover:bg-gray-50 transition-colors"
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${PROVIDER_COLORS.imap_smtp}`}>
                <ProviderMark provider="imap_smtp" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-dash-dark">{PROVIDER_LABELS.imap_smtp}</p>
                <p className="text-[11px] text-gray-400">Hostinger, cPanel, GoDaddy, custom servers</p>
              </div>
            </button>
          ) : (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/80 text-left">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border shrink-0 ${PROVIDER_COLORS.imap_smtp}`}>
                <ProviderMark provider="imap_smtp" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[13px] font-semibold text-gray-500">{PROVIDER_LABELS.imap_smtp}</p>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                    Unavailable
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">{IMAP_SMTP_UNSUPPORTED_MESSAGE}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmailAccountsPanel() {
  const { companyId: rawCompanyId } = useSettingsAccess();
  const companyId = rawCompanyId ?? undefined;
  const queryClient = useQueryClient();
  const [connectMode, setConnectMode] = useState<"closed" | "picker" | "imap">("closed");
  const [editingAccount, setEditingAccount] = useState<EmailAccountItem | null>(null);
  const imapSmtpAvailable = isImapSmtpConnectionAvailable();

  const { data: accounts, isLoading } = useEmailAccounts(companyId);
  const updateMutation = useUpdateEmailAccount();
  const disconnectMutation = useDisconnectEmailAccount();
  const testMutation = useTestEmailAccountConnection();
  const authorizeMutation = useAuthorizeEmailAccountOAuth();

  const refreshAccounts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: EMAIL_ACCOUNTS_KEYS.all });
  }, [queryClient]);

  useEmailOAuthReturnToast(refreshAccounts);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
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

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [refreshAccounts]);

  const activeCount = accounts?.filter((a) => a.status === "active").length ?? 0;
  const failedCount =
    accounts?.filter((a) => a.status === "error" || a.status === "expired").length ?? 0;

  const handleSetDefault = (account: EmailAccountItem) => {
    updateMutation.mutate(
      {
        accountId: account.id,
        payload: { is_default: true, company_id: companyId ?? undefined },
      },
      {
        onSuccess: () => toast.success(`${account.email} set as default.`),
        onError: (err: Error) => toast.error(err.message || "Failed to set default."),
      },
    );
  };

  const handleDisconnect = (account: EmailAccountItem) => {
    if (!window.confirm(`Remove "${account.display_name || account.email}"? This cannot be undone.`)) {
      return;
    }

    disconnectMutation.mutate(
      { accountId: account.id, companyId },
      {
        onSuccess: () => toast.success("Email account removed."),
        onError: (err: Error) => toast.error(err.message || "Failed to remove account."),
      },
    );
  };

  const handleTest = (account: EmailAccountItem) => {
    if (account.provider === "imap_smtp" && !imapSmtpAvailable) {
      toast.error(IMAP_SMTP_UNSUPPORTED_MESSAGE);
      return;
    }
    toast.info("Validating connection…");
    testMutation.mutate(
      { accountId: account.id, companyId },
      {
        onSuccess: (result) => {
          toast.success(result.message || "Connection test passed.");
          refreshAccounts();
        },
        onError: (err: Error & { errors?: Record<string, string[] | string> | null }) => {
          toast.error(getApiErrorMessage(err, "Connection test failed."), { duration: 12000 });
          refreshAccounts();
        },
      },
    );
  };

  const handleReconnect = (account: EmailAccountItem) => {
    if (account.provider === "imap_smtp") {
      if (!imapSmtpAvailable) {
        toast.error(IMAP_SMTP_UNSUPPORTED_MESSAGE);
        return;
      }
      setConnectMode("closed");
      setEditingAccount(account);
      return;
    }
    if (!companyId) {
      toast.error("Company context is required.");
      return;
    }

    authorizeMutation.mutate(
      {
        provider: account.provider,
        companyId,
        forceAccountPicker: true,
      },
      {
        onSuccess: (result) => {
          openAuthorizationPopup(result.data.authorization_url, `email-oauth-reconnect-${account.provider}`);
        },
        onError: (err: Error) => {
          toast.error(getApiErrorMessage(err, "Failed to start reconnection."), { duration: 12000 });
        },
      },
    );
  };

  const closeForms = () => {
    setConnectMode("closed");
    setEditingAccount(null);
  };

  const openImapForm = () => {
    if (!imapSmtpAvailable) {
      toast.error(IMAP_SMTP_UNSUPPORTED_MESSAGE);
      return;
    }
    setConnectMode("imap");
  };

  return (
    <SettingsSectionCard
      title="Email Accounts"
      description="Connect Google or Microsoft to send and sync CRM emails from your mailbox"
      scope="personal"
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          {!imapSmtpAvailable && (
            <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
              <AlertCircle size={16} className="text-gray-500 shrink-0 mt-0.5" />
              <p className="text-[12px] text-gray-700">{IMAP_SMTP_UNSUPPORTED_MESSAGE}</p>
            </div>
          )}

          {accounts && accounts.length > 0 && (
            <div
              className={`flex items-start gap-3 p-3 rounded-xl border ${
                failedCount > 0
                  ? "bg-amber-50 border-amber-100"
                  : "bg-emerald-50 border-emerald-100"
              }`}
            >
              {failedCount > 0 ? (
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              )}
              <p
                className={`text-[12px] ${
                  failedCount > 0 ? "text-amber-900" : "text-emerald-800"
                }`}
              >
                {accounts.length} account{accounts.length !== 1 ? "s" : ""} connected
                {" · "}
                <span className="font-semibold">{activeCount} active</span>
                {failedCount > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold">{failedCount} failed</span>
                    {" · reconnect or switch to Google/Microsoft"}
                  </>
                )}
              </p>
            </div>
          )}

          {accounts && accounts.length > 0 ? (
            <div className="space-y-3">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  imapSmtpAvailable={imapSmtpAvailable}
                  onSetDefault={() => handleSetDefault(account)}
                  onDisconnect={() => handleDisconnect(account)}
                  onTest={() => handleTest(account)}
                  onReconnect={() => handleReconnect(account)}
                  onEdit={() => {
                    if (!imapSmtpAvailable) {
                      toast.error(IMAP_SMTP_UNSUPPORTED_MESSAGE);
                      return;
                    }
                    setConnectMode("closed");
                    setEditingAccount(account);
                  }}
                  isSettingDefault={
                    updateMutation.isPending &&
                    updateMutation.variables?.accountId === account.id &&
                    !editingAccount
                  }
                  isDisconnecting={
                    disconnectMutation.isPending &&
                    disconnectMutation.variables?.accountId === account.id
                  }
                  isTesting={
                    testMutation.isPending &&
                    testMutation.variables?.accountId === account.id
                  }
                  isReconnecting={authorizeMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <Mail size={20} className="text-gray-400" />
              </div>
              <p className="text-[13px] font-semibold text-dash-dark mb-1">
                No email accounts connected
              </p>
              <p className="text-[12px] text-gray-400 max-w-[300px]">
                Connect Google or Microsoft (recommended) to send and sync CRM emails from your mailbox.
              </p>
            </div>
          )}

          {editingAccount && imapSmtpAvailable ? (
            <div className="border-t border-gray-100 pt-4">
              <ImapSmtpForm
                key={`edit-${editingAccount.id}`}
                companyId={companyId}
                account={editingAccount}
                onClose={closeForms}
                onSaved={refreshAccounts}
              />
            </div>
          ) : connectMode === "picker" ? (
            <div className="border-t border-gray-100 pt-4">
              <ConnectProviderPicker
                companyId={companyId}
                imapSmtpAvailable={imapSmtpAvailable}
                onClose={() => setConnectMode("closed")}
                onChooseImap={openImapForm}
              />
            </div>
          ) : connectMode === "imap" && imapSmtpAvailable ? (
            <div className="border-t border-gray-100 pt-4">
              <ImapSmtpForm
                key="create-imap"
                companyId={companyId}
                onClose={closeForms}
                onSaved={refreshAccounts}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConnectMode("picker")}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-dashed border-gray-200 text-[13px] font-semibold text-gray-500 hover:border-dash-dark hover:text-dash-dark transition-all"
            >
              <Mail size={15} />
              Connect Email Account
            </button>
          )}
        </div>
      )}
    </SettingsSectionCard>
  );
}
