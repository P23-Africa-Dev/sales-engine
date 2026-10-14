"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
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
  onSave: (input: AccountInput) => string | undefined;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [suggested, setSuggested] = useState(false);
  const [form, setForm] = useState<AccountInput>(
    account ?? {
      companyName: "",
      username: "",
      password: "",
      industry: "Technology",
      prospectPool: 500,
      country: "Nigeria",
      owner: "",
      scope: "Email outreach & lead discovery",
    },
  );
  const [confirm, setConfirm] = useState(account?.password ?? "");
  const industries = Array.from(
    new Set([
      ...accounts.map((a) => a.industry),
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
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          e.clientX < e.currentTarget.getBoundingClientRect().left
        )
          onClose();
      }}
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
              : "Give your next business a place to grow."}
          </p>
        </div>
        <button aria-label="Close drawer" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (form.password !== confirm) {
            setError("Passwords don’t match. Re-enter your confirmation.");
            return;
          }
          const result = onSave({
            ...form,
            companyName: form.companyName.trim(),
            username: form.username.trim(),
            owner: form.owner.trim(),
          });
          if (result) setError(result);
        }}
      >
        <div className="am-drawer-body">
          <div className="am-assist">
            <Sparkles size={20} />
            <div>
              <b>A little help getting started</b>
              <p>
                Our demo setup assistant can suggest a username and a starting
                prospect pool. Review every detail before saving.
              </p>
            </div>
          </div>
          <h3>Business details</h3>
          <label>
            Business name
            <input
              autoFocus
              required
              value={form.companyName}
              onChange={(e) => field("companyName", e.target.value)}
              placeholder="e.g. Acme Logistics"
              maxLength={70}
            />
          </label>
          <button
            type="button"
            className="am-suggest"
            disabled={!form.companyName.trim()}
            onClick={() => {
              setForm((prev) => ({
                ...prev,
                username:
                  prev.username ||
                  prev.companyName
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, ".") + "@demo.com",
                prospectPool: prev.industry === "Logistics" ? 1250 : 500,
              }));
              setSuggested(true);
            }}
          >
            {suggested ? <Check size={16} /> : <Sparkles size={16} />}{" "}
            {suggested
              ? "Suggestions applied · review below"
              : "Suggest setup with AI (demo)"}
          </button>
          <div className="am-form-pair">
            <label>
              Industry
              <select
                value={form.industry}
                onChange={(e) => field("industry", e.target.value)}
              >
                {industries.map((i) => (
                  <option key={i}>{i}</option>
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
          </div>
          <label>
            Account owner
            <input
              required
              value={form.owner}
              onChange={(e) => field("owner", e.target.value)}
              placeholder="Full name"
            />
          </label>
          <h3>Account credentials</h3>
          <label>
            Username / email
            <input
              required
              type="email"
              value={form.username}
              onChange={(e) => field("username", e.target.value)}
              placeholder="admin@business.com"
              autoComplete="off"
            />
          </label>
          <div className="am-form-pair">
            <label>
              Password
              <input
                required
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) => field("password", e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm password
              <input
                required
                type="password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
          <small className="am-form-hint">
            Use at least 8 characters. Credentials are for this demo session.
          </small>
          <h3>Initial setup</h3>
          <label>
            Setup scope
            <select
              value={form.scope}
              onChange={(e) => field("scope", e.target.value)}
            >
              <option>Email outreach & lead discovery</option>
              <option>Lead discovery only</option>
              <option>Full outreach: email, SMS & in-person</option>
            </select>
          </label>
          <label>
            Starting prospect pool
            <input
              type="number"
              min={0}
              max={1000000}
              required
              value={form.prospectPool}
              onChange={(e) => field("prospectPool", Number(e.target.value))}
            />
          </label>
          {error && (
            <p className="am-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="am-drawer-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="am-primary" type="submit">
            {account ? "Save changes" : "Create account"}
            <ArrowRight size={16} />
          </button>
        </footer>
      </form>
    </dialog>
  );
}
