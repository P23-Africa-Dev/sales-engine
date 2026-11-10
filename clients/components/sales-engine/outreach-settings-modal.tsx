"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Copy, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useAuthenticateOutreachDomain,
  useOutreachDomain,
  useRecheckOutreachDomainIntegrity,
  useResetOutreachDomain,
  useVerifyOutreachDomain,
} from "@/hooks/use-sales-engine-outreach-domain";
import {
  useConfirmOutreachInbox,
  useCreateOutreachInbox,
  useCreateOutreachSetupRequest,
  useDeleteOutreachInbox,
  useOutreachInboxes,
  useResendOutreachInboxConfirmation,
  useSetDefaultOutreachInbox,
} from "@/hooks/use-sales-engine-outreach-inbox";
import { useOutreachSenderSettings, useUpdateOutreachSenderSettings } from "@/hooks/use-sales-engine-outreach-sender";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { OutreachDnsRecord, OutreachIntegrityCheck, OutreachSenderMode } from "@/lib/api/sales-engine";

export type OutreachSettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

function connectionLabel(status: string | undefined): string {
  switch (status) {
    case "verified":
      return "Domain verified";
    case "failed":
      return "Domain / integrity failed";
    case "pending":
      return "DNS pending";
    default:
      return "Domain not connected";
  }
}

function integrityTone(status: string | undefined | null): string {
  switch (status) {
    case "pass":
      return "text-[#087652]";
    case "warn":
      return "text-[#b45309]";
    case "fail":
      return "text-[#b91c1c]";
    default:
      return "text-[#616263]";
  }
}

function DnsRecordRow({ record }: { record: OutreachDnsRecord }) {
  const [copiedField, setCopiedField] = useState<"host" | "data" | null>(null);

  const copy = async (field: "host" | "data", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1500);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  return (
    <div className="rounded-[12px] border border-[#e8e8e8] bg-[#fafafa] p-3 text-[11px] text-[#09232d]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-[#9d9d9d]">
          {record.type.toUpperCase()} record
        </span>
        {record.valid && (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-[#087652]">
            <Check size={11} /> Detected
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="w-10 shrink-0 text-[#9d9d9d]">Host</span>
        <code className="flex-1 truncate rounded-[8px] bg-white px-2 py-1 text-[#09232d] shadow-[inset_0_0_0_1px_#ececec]">
          {record.host}
        </code>
        <button
          type="button"
          onClick={() => copy("host", record.host)}
          className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[#616263] transition hover:bg-[#f0f0f0]"
          aria-label="Copy host"
        >
          {copiedField === "host" ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="w-10 shrink-0 text-[#9d9d9d]">Value</span>
        <code className="flex-1 truncate rounded-[8px] bg-white px-2 py-1 text-[#09232d] shadow-[inset_0_0_0_1px_#ececec]">
          {record.data}
        </code>
        <button
          type="button"
          onClick={() => copy("data", record.data)}
          className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[#616263] transition hover:bg-[#f0f0f0]"
          aria-label="Copy value"
        >
          {copiedField === "data" ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}

function IntegrityChecklist({
  status,
  checks,
  onRecheck,
  rechecking,
}: {
  status?: string | null;
  checks?: OutreachIntegrityCheck[];
  onRecheck: () => void;
  rechecking: boolean;
}) {
  if (!checks || checks.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 rounded-[12px] border border-[#ececec] bg-[#fafafa] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[11px] font-semibold ${integrityTone(status)}`}>
          Domain integrity: {status ?? "unchecked"}
        </p>
        <button
          type="button"
          onClick={onRecheck}
          disabled={rechecking}
          className="text-[10px] font-medium text-[#616263] underline underline-offset-2 hover:text-[#09232d] disabled:opacity-50"
        >
          {rechecking ? "Checking…" : "Recheck"}
        </button>
      </div>
      <ul className="space-y-1.5">
        {checks.map((check) => (
          <li key={check.key} className="flex items-start gap-2 text-[10px] leading-[14px]">
            {check.status === "pass" ? (
              <Check size={12} className="mt-0.5 shrink-0 text-[#087652]" />
            ) : (
              <AlertTriangle
                size={12}
                className={`mt-0.5 shrink-0 ${
                  check.status === "warn" ? "text-[#b45309]" : "text-[#b91c1c]"
                }`}
              />
            )}
            <span>
              <span className="font-semibold text-[#09232d]">{check.label}: </span>
              <span className="text-[#616263]">{check.message}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OutreachSettingsModal({ open, onClose }: OutreachSettingsModalProps) {
  const { data: senderSettings, isLoading: senderLoading } = useOutreachSenderSettings(open);
  const { data: domainAuth, isLoading: domainLoading } = useOutreachDomain(open);
  const { data: inboxes, isLoading: inboxLoading } = useOutreachInboxes(open);
  const authenticate = useAuthenticateOutreachDomain();
  const verify = useVerifyOutreachDomain();
  const reset = useResetOutreachDomain();
  const recheck = useRecheckOutreachDomainIntegrity();
  const createInbox = useCreateOutreachInbox();
  const confirmInbox = useConfirmOutreachInbox();
  const resendInbox = useResendOutreachInboxConfirmation();
  const setDefaultInbox = useSetDefaultOutreachInbox();
  const deleteInbox = useDeleteOutreachInbox();
  const askSupport = useCreateOutreachSetupRequest();
  const updateSender = useUpdateOutreachSenderSettings();

  const [domain, setDomain] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [inboxEmail, setInboxEmail] = useState("");
  const [confirmCodes, setConfirmCodes] = useState<Record<number, string>>({});
  const [supportNote, setSupportNote] = useState("");
  const [senderMode, setSenderMode] = useState<OutreachSenderMode>("platform");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [showOrgSetup, setShowOrgSetup] = useState(false);

  const connectionStatus =
    senderSettings?.org_connection_status ??
    (domainAuth
      ? domainAuth.verification_status === "verified"
        ? "verified"
        : domainAuth.verification_status === "failed"
          ? "failed"
          : "pending"
      : "not_connected");

  const integrityOk =
    domainAuth?.integrity_status === "pass" || domainAuth?.integrity_status === "warn";
  const domainReady = connectionStatus === "verified" && integrityOk;
  const isLoading = senderLoading || domainLoading || inboxLoading;

  useEffect(() => {
    if (!open) return;
    if (domainAuth?.domain) setDomain(domainAuth.domain);
    if (domainAuth?.from_email) setFromEmail(domainAuth.from_email);
  }, [open, domainAuth]);

  useEffect(() => {
    if (!open || !senderSettings) return;
    setSenderMode(senderSettings.sender_mode ?? "platform");
    setReplyToEmail(senderSettings.reply_to_email ?? "");
    setShowOrgSetup(
      senderSettings.sender_mode === "organization" ||
        senderSettings.org_connection_status !== "not_connected"
    );
  }, [open, senderSettings]);

  const confirmedInboxes = useMemo(
    () => (inboxes ?? []).filter((i) => i.status === "confirmed"),
    [inboxes]
  );

  const quotaLabel = senderSettings?.quota
    ? `${senderSettings.quota.used}/${senderSettings.quota.limit} sends today`
    : null;

  const setup = senderSettings?.setup;
  const orgReady = Boolean(setup?.can_send_organization);
  const integrityChecks =
    domainAuth?.integrity_checks ?? senderSettings?.integrity_checks ?? [];
  const integrityStatus = domainAuth?.integrity_status ?? senderSettings?.integrity_status;

  const activeFrom =
    senderMode === "organization" && orgReady
      ? senderSettings?.default_inbox?.email ||
        senderSettings?.org_verified_from_email ||
        "Your organization inbox"
      : senderSettings?.platform_from_email || "Platform email";

  const handleSelectPlatform = async () => {
    setSenderMode("platform");
    setShowOrgSetup(connectionStatus !== "not_connected");
    try {
      await updateSender.mutateAsync({
        sender_mode: "platform",
        reply_to_email: replyToEmail.trim() || undefined,
      });
      toast.success("Using platform sending.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not switch to platform sending."));
    }
  };

  const handleSelectOrganization = async () => {
    setShowOrgSetup(true);
    if (!orgReady) {
      setSenderMode("organization");
      toast("Finish domain + inbox setup below, then switch to organization sending.");
      return;
    }
    try {
      await updateSender.mutateAsync({ sender_mode: "organization" });
      setSenderMode("organization");
      toast.success("Using your organization domain.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not switch to organization sending."));
    }
  };

  const handleSaveReplyTo = async () => {
    const value = replyToEmail.trim();
    if (!value) {
      toast.error("Reply-To email is required.");
      return;
    }
    try {
      await updateSender.mutateAsync({
        sender_mode: senderMode,
        reply_to_email: value,
      });
      toast.success("Reply-To updated.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update Reply-To."));
    }
  };

  const handleAuthenticate = () => {
    authenticate.mutate(
      { domain: domain.trim(), from_email: fromEmail.trim() },
      {
        onSuccess: () => toast.success("DNS records generated. Add them at your DNS host."),
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not start domain authentication.")),
      }
    );
  };

  const handleVerify = () => {
    verify.mutate(undefined, {
      onSuccess: (result) => {
        const ok =
          result?.verification_status === "verified" &&
          (result.integrity_status === "pass" || result.integrity_status === "warn");
        if (ok) {
          toast.success("Domain verified. Add and confirm at least one inbox.");
          return;
        }
        if (result?.verification_status === "verified") {
          toast.error("SendGrid verified, but integrity checks failed. Fix the checklist below.");
          return;
        }
        toast("DNS not detected yet. This can take up to 48 hours.");
      },
      onError: (error) => toast.error(getApiErrorMessage(error, "Could not verify domain.")),
    });
  };

  const handleReset = () => {
    reset.mutate(undefined, {
      onSuccess: () => {
        setDomain("");
        setFromEmail("");
        toast.success("Domain removed. You can connect a different one.");
      },
      onError: (error) => toast.error(getApiErrorMessage(error, "Could not remove domain.")),
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/55 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", duration: 0.32 }}
            role="dialog"
            aria-modal="true"
            aria-label="Outreach email settings"
            className="relative z-10 flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[24px] border border-[#e8e8e8] bg-white text-[#09232d] shadow-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#ececec] px-5 py-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9d9d9d]">
                  Outreach
                </p>
                <h3 className="mt-0.5 text-[16px] font-semibold">Email setup</h3>
                <p className="mt-1 text-[11px] text-[#616263]">
                  Recommended: connect your organization domain. Platform sending stays available
                  until you are ready.
                  {quotaLabel ? ` · ${quotaLabel}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid size-8 place-items-center rounded-full text-[#616263] transition hover:bg-[#f3f3f3]"
                aria-label="Close email settings"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-[13px] text-[#616263]">
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Loading email settings…
                </div>
              ) : (
                <>
                  <section className="rounded-[16px] border border-[#ececec] bg-[#fafafa] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold">How you send</p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#616263] shadow-[inset_0_0_0_1px_#ececec]">
                        {connectionLabel(connectionStatus)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#616263]">
                      Current From: <span className="font-medium text-[#09232d]">{activeFrom}</span>
                    </p>

                    <div className="mt-3 space-y-2">
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-[#e8e8e8] bg-white px-3 py-2.5">
                        <input
                          type="radio"
                          name="outreach-sender-mode"
                          checked={senderMode === "platform"}
                          onChange={() => void handleSelectPlatform()}
                          className="mt-0.5 accent-[#09232d]"
                        />
                        <span>
                          <span className="block text-[12px] font-semibold">
                            Send using The Factory (platform)
                          </span>
                          <span className="mt-0.5 block text-[10px] text-[#616263]">
                            Uses the platform sending domain. Reply-To defaults to your email (you
                            can change it). Lower daily cap.
                          </span>
                        </span>
                      </label>

                      <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-[#e8e8e8] bg-white px-3 py-2.5">
                        <input
                          type="radio"
                          name="outreach-sender-mode"
                          checked={senderMode === "organization"}
                          onChange={() => void handleSelectOrganization()}
                          className="mt-0.5 accent-[#09232d]"
                        />
                        <span>
                          <span className="block text-[12px] font-semibold">
                            Send using my organization email{" "}
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-[#087652]">
                              Recommended
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[10px] text-[#616263]">
                            Authenticate your domain and confirm inboxes for better deliverability.
                            {orgReady ? " Ready." : " Finish setup below to enable."}
                          </span>
                        </span>
                      </label>
                    </div>

                    {senderMode === "platform" && (
                      <div className="mt-3 space-y-2 rounded-[12px] border border-[#e8e8e8] bg-white p-3">
                        <p className="text-[11px] font-semibold text-[#09232d]">Reply-To</p>
                        <p className="text-[10px] text-[#616263]">
                          Replies go here. Defaults to your account email.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={replyToEmail}
                            onChange={(e) => setReplyToEmail(e.target.value)}
                            placeholder="you@company.com"
                            className="h-9 flex-1 rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-[12px] outline-none focus:border-[#09232d]/50"
                          />
                          <button
                            type="button"
                            disabled={updateSender.isPending}
                            onClick={() => void handleSaveReplyTo()}
                            className="h-9 shrink-0 rounded-[10px] bg-[#09232d] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}

                    {senderMode === "platform" ? (
                      <p className="mt-2 text-[11px] font-medium text-[#087652]">
                        Platform sending is available now.
                      </p>
                    ) : orgReady ? (
                      <p className="mt-2 text-[11px] font-medium text-[#087652]">
                        Domain and inbox ready. Choose an inbox when you send.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-[10px] text-[#b91c1c]">
                        {(setup?.blocking_reasons ?? ["Complete domain and inbox setup."]).map(
                          (reason) => (
                            <li key={reason}>• {reason}</li>
                          )
                        )}
                      </ul>
                    )}
                  </section>

                  {(showOrgSetup ||
                    senderMode === "organization" ||
                    connectionStatus !== "not_connected") && (
                    <div className="space-y-4">
                  <section className="rounded-[16px] border border-[#ececec] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold">1. Organization domain</p>
                      {domainAuth && (
                        <button
                          type="button"
                          onClick={handleReset}
                          disabled={reset.isPending}
                          className="text-[10px] font-medium text-[#616263] underline underline-offset-2 hover:text-[#09232d] disabled:opacity-50"
                        >
                          Use a different domain
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] leading-[14px] text-[#616263]">
                      Add only the SendGrid CNAME records we show, plus a DMARC TXT. Leave your MX
                      and your mail provider&apos;s SPF/DKIM unchanged so replies stay in your
                      existing inbox.
                    </p>

                    {domainReady && domainAuth ? (
                      <>
                        <p className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-[#cdeee0] bg-[#f0fdf7] px-3 py-2 text-[11px] font-semibold text-[#087652]">
                          <Check size={13} /> Domain ready: {domainAuth.domain}
                        </p>
                        <IntegrityChecklist
                          status={integrityStatus}
                          checks={integrityChecks}
                          onRecheck={() =>
                            recheck.mutate(undefined, {
                              onSuccess: () => toast.success("Integrity rechecked."),
                              onError: (error) =>
                                toast.error(
                                  getApiErrorMessage(error, "Could not recheck integrity.")
                                ),
                            })
                          }
                          rechecking={recheck.isPending}
                        />
                      </>
                    ) : !domainAuth ? (
                      <div className="mt-3 space-y-2">
                        <input
                          type="text"
                          value={domain}
                          onChange={(e) => setDomain(e.target.value)}
                          placeholder="yourcompany.com"
                          className="h-9 w-full rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-[12px] outline-none focus:border-[#09232d]/50"
                        />
                        <input
                          type="email"
                          value={fromEmail}
                          onChange={(e) => setFromEmail(e.target.value)}
                          placeholder="sales@yourcompany.com"
                          className="h-9 w-full rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-[12px] outline-none focus:border-[#09232d]/50"
                        />
                        <button
                          type="button"
                          disabled={
                            authenticate.isPending || !domain.trim() || !fromEmail.trim()
                          }
                          onClick={handleAuthenticate}
                          className="h-9 w-full rounded-[10px] bg-[#09232d] text-[11px] font-semibold text-white transition hover:bg-[#0f3340] disabled:opacity-50"
                        >
                          {authenticate.isPending ? "Generating…" : "Generate DNS records"}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <p className="text-[11px] font-medium text-[#09232d]">{domainAuth.domain}</p>
                        <p className="text-[10px] leading-[14px] text-[#616263]">
                          Add these DNS records at your domain host, then verify. Also add a DMARC
                          TXT at _dmarc.{domainAuth.domain}.
                        </p>
                        {(domainAuth.dns_records ?? []).map((record) => (
                          <DnsRecordRow key={record.label} record={record} />
                        ))}
                        <IntegrityChecklist
                          status={integrityStatus}
                          checks={integrityChecks}
                          onRecheck={() =>
                            recheck.mutate(undefined, {
                              onError: (error) =>
                                toast.error(
                                  getApiErrorMessage(error, "Could not recheck integrity.")
                                ),
                            })
                          }
                          rechecking={recheck.isPending}
                        />
                        <button
                          type="button"
                          disabled={verify.isPending}
                          onClick={handleVerify}
                          className="h-9 w-full rounded-[10px] bg-[#09232d] text-[11px] font-semibold text-white transition hover:bg-[#0f3340] disabled:opacity-50"
                        >
                          {verify.isPending ? "Checking…" : "I've added these records. Verify!"}
                        </button>
                      </div>
                    )}
                  </section>

                  <section className="rounded-[16px] border border-[#ececec] p-4">
                    <p className="text-[13px] font-semibold">2. Inboxes</p>
                    <p className="mt-1 text-[10px] leading-[14px] text-[#616263]">
                      Create the mailbox at your own provider first (Google, Microsoft, Zoho, etc.),
                      then confirm it here. Replies stay in that mailbox.
                    </p>

                    {!domainAuth ? (
                      <p className="mt-3 text-[10px] text-[#616263]">
                        Connect your domain before adding inboxes.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {(inboxes ?? []).map((inbox) => (
                          <div
                            key={inbox.id}
                            className="rounded-[12px] border border-[#e8e8e8] bg-white px-3 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[12px] font-semibold">{inbox.email}</p>
                                <p className="text-[10px] capitalize text-[#616263]">
                                  {inbox.status}
                                  {inbox.is_default ? " · default" : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  deleteInbox.mutate(inbox.id, {
                                    onSuccess: () => toast.success("Inbox removed."),
                                    onError: (error) =>
                                      toast.error(
                                        getApiErrorMessage(error, "Could not remove inbox.")
                                      ),
                                  })
                                }
                                className="text-[10px] text-[#616263] underline"
                              >
                                Remove
                              </button>
                            </div>
                            {inbox.status === "pending" && (
                              <div className="mt-2 flex gap-2">
                                <input
                                  type="text"
                                  value={confirmCodes[inbox.id] ?? ""}
                                  onChange={(e) =>
                                    setConfirmCodes((prev) => ({
                                      ...prev,
                                      [inbox.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="6-digit code"
                                  className="h-8 flex-1 rounded-[8px] border border-[#d1d1d1] px-2 text-[12px]"
                                />
                                <button
                                  type="button"
                                  disabled={confirmInbox.isPending}
                                  onClick={() =>
                                    confirmInbox.mutate(
                                      { id: inbox.id, code: confirmCodes[inbox.id] ?? "" },
                                      {
                                        onSuccess: () => toast.success("Inbox confirmed."),
                                        onError: (error) =>
                                          toast.error(
                                            getApiErrorMessage(error, "Could not confirm inbox.")
                                          ),
                                      }
                                    )
                                  }
                                  className="h-8 rounded-[8px] bg-[#09232d] px-3 text-[10px] font-semibold text-white"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  disabled={resendInbox.isPending}
                                  onClick={() =>
                                    resendInbox.mutate(inbox.id, {
                                      onSuccess: () => toast.success("Code resent."),
                                      onError: (error) =>
                                        toast.error(
                                          getApiErrorMessage(error, "Could not resend code.")
                                        ),
                                    })
                                  }
                                  className="h-8 text-[10px] underline text-[#616263]"
                                >
                                  Resend
                                </button>
                              </div>
                            )}
                            {inbox.status === "confirmed" && !inbox.is_default && (
                              <button
                                type="button"
                                className="mt-2 text-[10px] underline text-[#616263]"
                                onClick={() =>
                                  setDefaultInbox.mutate(inbox.id, {
                                    onSuccess: () => toast.success("Default inbox updated."),
                                  })
                                }
                              >
                                Make default
                              </button>
                            )}
                          </div>
                        ))}

                        <div className="flex gap-2 pt-1">
                          <input
                            type="email"
                            value={inboxEmail}
                            onChange={(e) => setInboxEmail(e.target.value)}
                            placeholder={`you@${domainAuth.domain}`}
                            className="h-9 flex-1 rounded-[10px] border border-[#d1d1d1] px-3 text-[12px]"
                          />
                          <button
                            type="button"
                            disabled={createInbox.isPending || !inboxEmail.trim()}
                            onClick={() =>
                              createInbox.mutate(
                                { email: inboxEmail.trim() },
                                {
                                  onSuccess: () => {
                                    setInboxEmail("");
                                    toast.success("Confirmation code sent.");
                                  },
                                  onError: (error) =>
                                    toast.error(
                                      getApiErrorMessage(error, "Could not add inbox.")
                                    ),
                                }
                              )
                            }
                            className="h-9 rounded-[10px] bg-[#09232d] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                        {confirmedInboxes.length === 0 && (
                          <p className="text-[10px] text-[#b45309]">
                            Confirm at least one inbox before switching to organization sending.
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                    </div>
                  )}

                  <section className="rounded-[16px] border border-[#ececec] p-4">
                    <p className="text-[13px] font-semibold">Need help?</p>
                    <p className="mt-1 text-[10px] leading-[14px] text-[#616263]">
                      Ask Sales Engine support to finish DNS or inbox setup for you.
                    </p>
                    {senderSettings?.support_request ? (
                      <p className="mt-3 text-[11px] font-medium text-[#087652]">
                        Support request open ({senderSettings.support_request.status}).
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={supportNote}
                          onChange={(e) => setSupportNote(e.target.value)}
                          placeholder="Optional note for support…"
                          rows={2}
                          className="w-full rounded-[10px] border border-[#d1d1d1] px-3 py-2 text-[12px]"
                        />
                        <button
                          type="button"
                          disabled={askSupport.isPending}
                          onClick={() =>
                            askSupport.mutate(
                              {
                                note: supportNote.trim() || undefined,
                                domain: domainAuth?.domain,
                              },
                              {
                                onSuccess: () => {
                                  setSupportNote("");
                                  toast.success("Support has your setup request.");
                                },
                                onError: (error) =>
                                  toast.error(
                                    getApiErrorMessage(error, "Could not create support request.")
                                  ),
                              }
                            )
                          }
                          className="h-9 w-full rounded-[10px] border border-[#e8e8e8] bg-white text-[11px] font-semibold text-[#09232d]"
                        >
                          Ask Sales Engine support
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>

            <div className="flex shrink-0 justify-end border-t border-[#ececec] bg-[#f7f7f7] px-5 py-3.5">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-[10px] bg-[#09232d] px-4 text-[11px] font-semibold text-white transition hover:bg-[#0f3340]"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
