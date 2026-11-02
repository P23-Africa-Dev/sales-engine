"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import type { Account, AccountInput } from "./types";

export function AccountDrawer({
  account,
  accounts,
  onClose,
  onSave,
}: {
  account?: Account;
  accounts: Account[];
  onClose: () => void;
  onSave: (input: AccountInput) => Promise<string | undefined>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [form, setForm] = useState<AccountInput>(
    account
      ? {
          companyName: account.companyName,
          industry: account.industry,
          country: account.country,
          owner: account.owner,
          ownerEmail: account.ownerEmail,
          scope: account.scope,
        }
      : {
          companyName: "",
          ownerEmail: "",
          industry: "Technology",
          country: "Nigeria",
          owner: "",
          scope: "Email outreach & lead discovery",
        },
  );
  const industries = Array.from(
    new Set([
      ...accounts.map((a) => a.industry).filter(Boolean),
      "Technology",
      "Software & SaaS",
      "Logistics",
      "Venture Capital",
      "Consulting",
      "Healthcare",
      "Finance",
      "Real Estate",
    ]),
  ).sort();

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  function field(key: keyof AccountInput, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  }

  return (
    <dialog
      ref={dialog}
      className="am-drawer"
      onCancel={onClose}
      aria-labelledby="am-drawer-title"
    >
      <div className="am-drawer-header">
        <div>
          <h2 id="am-drawer-title">
            {account ? "Edit business" : "Add a business"}
          </h2>
          <p>
            {account
              ? "Keep your business details up to date."
              : "Invite an owner and provision a Sales Engine workspace."}
          </p>
        </div>
        <button aria-label="Close drawer" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const result = await onSave({
            ...form,
            companyName: form.companyName.trim(),
            owner: form.owner.trim(),
            ownerEmail: form.ownerEmail.trim(),
          });
          setSaving(false);
          if (result) setError(result);
        }}
      >
        <label>
          Business name
          <input
            required
            value={form.companyName}
            onChange={(e) => field("companyName", e.target.value)}
            placeholder="e.g. Acme Logistics"
          />
        </label>
        <label>
          Industry
          <select
            value={form.industry}
            onChange={(e) => field("industry", e.target.value)}
          >
            {industries.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Country
          <input
            required
            value={form.country}
            onChange={(e) => field("country", e.target.value)}
          />
        </label>
        <label>
          Owner name
          <input
            required
            value={form.owner}
            onChange={(e) => field("owner", e.target.value)}
            placeholder="Full name"
          />
        </label>
        <label>
          Owner email
          <input
            required
            type="email"
            value={form.ownerEmail}
            onChange={(e) => field("ownerEmail", e.target.value)}
            placeholder="admin@business.com"
            disabled={Boolean(account)}
          />
        </label>
        {!account && (
          <p className="am-help">
            An invitation email is sent to the owner. Passwords are never set by
            admins.
          </p>
        )}
        <label>
          Setup scope
          <input
            required
            value={form.scope}
            onChange={(e) => field("scope", e.target.value)}
          />
        </label>

        <button
          type="button"
          className="am-suggest"
          onClick={() => {
            const slug = form.companyName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, ".")
              .replace(/^\.|\.$/g, "");
            if (!form.ownerEmail && slug) {
              field("ownerEmail", `${slug}@example.com`);
            }
            if (!form.scope) {
              field("scope", "Email outreach & lead discovery");
            }
            setSuggested(true);
          }}
        >
          <Sparkles size={16} /> Suggest setup (local)
        </button>
        {suggested && (
          <p className="am-help">
            <Check size={14} /> Local suggestions applied — review before saving.
          </p>
        )}

        {error && (
          <p className="am-error" role="alert">
            {error}
          </p>
        )}

        <div className="am-drawer-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="am-primary" disabled={saving}>
            {saving ? "Saving…" : account ? "Save changes" : "Create & invite"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
