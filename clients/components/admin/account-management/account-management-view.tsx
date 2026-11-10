"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Check,
  Search,
  Plus,
  Pencil,
  SlidersHorizontal,
  Users,
  X,
  LogIn,
} from "lucide-react";
import { AccountDrawer } from "./account-drawer";
import type { Account, AccountInput } from "./types";
import "./account-management.css";

const seeds = [
  [
    "Nigeria Business",
    "Logistics",
    "Nigeria",
    "Kwame Smith",
    1250,
    "Active",
    "#087f83",
  ],
  [
    "Antler in Nigeria",
    "Venture Capital",
    "Nigeria",
    "Ada Okafor",
    800,
    "Active",
    "#7856a5",
  ],
  [
    "Meridian BioTech",
    "Healthcare",
    "Denmark",
    "Freja Nielsen",
    2400,
    "Active",
    "#4766aa",
  ],
  [
    "Atlas Global Logistics",
    "Logistics",
    "Netherlands",
    "Lukas van Dijk",
    5600,
    "Active",
    "#a76a27",
  ],
  [
    "Blessing Ibunge",
    "Consulting",
    "Nigeria",
    "Blessing Ibunge",
    300,
    "Pending",
    "#a35c74",
  ],
  [
    "NordTech Solutions",
    "Software & SaaS",
    "Germany",
    "Michael Weber",
    3200,
    "Active",
    "#407b67",
  ],
  [
    "Alpine Precision",
    "Technology",
    "Switzerland",
    "Stefan Lindner",
    1800,
    "Active",
    "#526ca5",
  ],
  [
    "Oak & Stone",
    "Real Estate",
    "Ghana",
    "Ama Mensah",
    650,
    "Pending",
    "#97714a",
  ],
  [
    "Paybridge Africa",
    "Finance",
    "Nigeria",
    "Tunde Bello",
    4100,
    "Active",
    "#6356a6",
  ],
  [
    "Clearpath Advisory",
    "Consulting",
    "United Kingdom",
    "Sarah James",
    920,
    "Inactive",
    "#687c89",
  ],
  [
    "Luma Health",
    "Healthcare",
    "Kenya",
    "Nia Kamau",
    1600,
    "Active",
    "#997149",
  ],
  [
    "Fieldwork Studio",
    "Technology",
    "South Africa",
    "Leo Jacobs",
    450,
    "Pending",
    "#8d5b81",
  ],
];
const initialAccounts: Account[] = seeds.map((s, i) => ({
  id: String(i + 1),
  companyName: String(s[0]),
  industry: String(s[1]),
  country: String(s[2]),
  owner: String(s[3]),
  prospectPool: Number(s[4]),
  status: s[5] as Account["status"],
  avatarColor: String(s[6]),
  username:
    String(s[0])
      .toLowerCase()
      .replaceAll(/[^a-z]/g, ".") + "@demo.com",
  password: "Demo123!",
  created: `2026-10-${String(Math.max(1, 8 - i)).padStart(2, "0")}`,
  scope: "Email outreach & lead discovery",
}));
const number = (n: number) => n.toLocaleString();
const initials = (s: string) =>
  s
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

export function AccountManagementView() {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selectedId, setSelectedId] = useState("1");
  const [activeId, setActiveId] = useState("");
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("");
  const [pool, setPool] = useState("");
  const [status, setStatus] = useState("All businesses");
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<"create" | "edit" | null>(null);
  const [login, setLogin] = useState(false);
  const loginDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!login) return;
    const previous = document.activeElement as HTMLElement;
    loginDialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [login]);
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = accounts.find((a) => a.id === selectedId)!;
  const active = accounts.find((a) => a.id === activeId);
  const scoped = active ? accounts.filter((a) => a.id === activeId) : accounts;
  const filtered = scoped.filter(
    (a) =>
      (!query ||
        `${a.companyName} ${a.username} ${a.owner}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!industry || a.industry === industry) &&
      (!pool ||
        (pool === "small"
          ? a.prospectPool < 1000
          : pool === "medium"
            ? a.prospectPool >= 1000 && a.prospectPool < 3000
            : a.prospectPool >= 3000)) &&
      (status === "All businesses" || a.status === status),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * 6, current * 6);
  function reset() {
    setQuery("");
    setIndustry("");
    setPool("");
    setStatus("All businesses");
    setPage(1);
  }
  function save(input: AccountInput) {
    if (
      accounts.some(
        (a) =>
          a.username.toLowerCase() === input.username.toLowerCase() &&
          (drawer !== "edit" || a.id !== selectedId),
      )
    )
      return "That username already belongs to another account.";
    if (drawer === "edit") {
      setAccounts((prev) =>
        prev.map((a) => (a.id === selectedId ? { ...a, ...input } : a)),
      );
      setNotice("Business details updated.");
    } else {
      const a: Account = {
        ...input,
        id: crypto.randomUUID(),
        created: "2026-10-08",
        status: "Active",
        avatarColor: "#087f83",
      };
      setAccounts((prev) => [a, ...prev]);
      setSelectedId(a.id);
      setActiveId("");
      reset();
      setNotice(`${a.companyName} added to your businesses.`);
    }
    setDrawer(null);
  }
  return (
    <div className="am-page">
      <div className="am-heading">
        <div>
          <h1>Account Management</h1>
          <p>A home for every business. A clear view of what’s next.</p>
        </div>
        <button className="am-primary" onClick={() => setDrawer("create")}>
          <Plus size={17} /> Add business
        </button>
      </div>
      <div className="am-summary">
        <div>
          <span>
            <Building2 size={17} /> Managed businesses
          </span>
          <strong>{scoped.length.toString().padStart(2, "0")}</strong>
          <small>
            {active ? "In your active account" : "Across your workspace"}
          </small>
        </div>
        <div>
          <span>
            <Check size={17} /> Active businesses
          </span>
          <strong>
            {scoped
              .filter((a) => a.status === "Active")
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <small>
            {scoped.filter((a) => a.status === "Pending").length} awaiting setup
          </small>
        </div>
        <div>
          <span>
            <Users size={17} /> Prospect pool
          </span>
          <strong>
            {number(scoped.reduce((n, a) => n + a.prospectPool, 0))}
          </strong>
          <small>Ready for your next connection</small>
        </div>
        <div className="am-context">
          <span className="am-live-dot" />{" "}
          <div>
            <b>{active ? active.companyName : "Workspace overview"}</b>
            <p>
              {active
                ? "Viewing your active account"
                : "You’re viewing all managed accounts"}
            </p>
            <button
              onClick={() => {
                if (active) {
                  setActiveId("");
                  reset();
                } else setLogin(true);
              }}
            >
              {active ? "Return to all accounts" : "Sign in to an account"}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      </div>
      {notice && (
        <div className="am-notice" role="status">
          <Check size={16} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <section className="am-workspace" aria-label="Business directory">
        <div className="am-directory-top">
          <div>
            <h2>
              Your businesses <span>{scoped.length}</span>
            </h2>
            <p>Manage accounts, explore prospects, and keep things moving.</p>
          </div>
          {/* <span className="am-demo">Demo workspace</span> */}
        </div>
        <div className="am-tools">
          <label className="am-search">
            <Search size={17} />
            <input
              aria-label="Search businesses"
              placeholder="Search business, owner or email…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <div className="am-filters">
            <SlidersHorizontal size={16} />
            <select
              aria-label="Filter by industry"
              value={industry}
              onChange={(e) => {
                setIndustry(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All industries</option>
              {Array.from(new Set(accounts.map((a) => a.industry)))
                .sort()
                .map((i) => (
                  <option key={i}>{i}</option>
                ))}
            </select>
            <select
              aria-label="Filter by prospect pool"
              value={pool}
              onChange={(e) => {
                setPool(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Any prospect pool</option>
              <option value="small">Under 1,000</option>
              <option value="medium">1,000–2,999</option>
              <option value="large">3,000 and above</option>
            </select>
          </div>
        </div>
        <div className="am-tabs" aria-label="Business status">
          {["All businesses", "Active", "Pending", "Inactive"].map((s) => (
            <button
              key={s}
              aria-pressed={s === status}
              className={s === status ? "is-active" : ""}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {s}
              <span>
                {s === "All businesses"
                  ? scoped.length
                  : scoped.filter((a) => a.status === s).length}
              </span>
            </button>
          ))}
          {(query || industry || pool || status !== "All businesses") && (
            <button onClick={reset} className="am-reset">
              Clear filters <X size={13} />
            </button>
          )}
        </div>
        <div className="am-main">
          <div className="am-directory">
            <div className="am-table-scroll">
              <table className="am-table">
                <thead>
                  <tr>
                    <th>Business / account owner</th>
                    <th>Industry</th>
                    <th>Prospects</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr
                      key={a.id}
                      className={selectedId === a.id ? "am-selected" : ""}
                      onClick={() => setSelectedId(a.id)}
                    >
                      <td>
                        <button
                          className="am-business"
                          onClick={() => setSelectedId(a.id)}
                          aria-label={`View ${a.companyName}`}
                          aria-pressed={selectedId === a.id}
                        >
                          <span
                            className="am-monogram"
                            style={{ background: a.avatarColor }}
                          >
                            {initials(a.companyName)}
                          </span>
                          <span>
                            <b>{a.companyName}</b>
                            <small>
                              {a.owner} <span>· {a.country}</span>
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>{a.industry}</td>
                      <td className="am-numeric">{number(a.prospectPool)}</td>
                      <td>
                        <span
                          className={`am-status am-status-${a.status.toLowerCase()}`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td>
                        <ChevronRight size={15} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <div className="am-empty">
                <Search size={28} />
                <h3>No businesses found</h3>
                <p>Try a different name or adjust your filters.</p>
                <button onClick={reset}>Clear filters</button>
              </div>
            )}
            <div className="am-pagination">
              <p>
                {filtered.length ? (
                  <>
                    <b>
                      {(current - 1) * 6 + 1}–
                      {Math.min(current * 6, filtered.length)}
                    </b>{" "}
                    of <b>{filtered.length}</b> businesses
                  </>
                ) : (
                  "0 businesses"
                )}
              </p>
              <nav aria-label="Business pages">
                <button
                  aria-label="Previous page"
                  disabled={current === 1}
                  onClick={() => setPage(current - 1)}
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: pages }, (_, i) => (
                  <button
                    key={i}
                    aria-label={`Page ${i + 1}`}
                    aria-current={current === i + 1 ? "page" : undefined}
                    onClick={() => setPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  aria-label="Next page"
                  disabled={current === pages}
                  onClick={() => setPage(current + 1)}
                >
                  <ChevronRight size={15} />
                </button>
              </nav>
            </div>
          </div>
          <aside className="am-detail" aria-label="Selected business details">
            <div className="am-detail-top">
              <span>Business overview</span>
              <button
                aria-label="Edit business"
                onClick={() => setDrawer("edit")}
              >
                <Pencil size={16} />
              </button>
            </div>
            <span
              className="am-monogram am-large"
              style={{ background: selected.avatarColor }}
            >
              {initials(selected.companyName)}
            </span>
            <h2>{selected.companyName}</h2>
            <p className="am-detail-sub">
              {selected.industry} <span>·</span> {selected.country}
            </p>
            <span
              className={`am-status am-status-${selected.status.toLowerCase()}`}
            >
              {selected.status}
            </span>
            <div className="am-detail-pool">
              <span>
                Available prospects <ArrowUpRight size={17} />
              </span>
              <strong>{number(selected.prospectPool)}</strong>
              <small>In this business’s prospect pool</small>
            </div>
            <dl>
              <div>
                <dt>Account owner</dt>
                <dd>{selected.owner}</dd>
              </div>
              <div>
                <dt>Username</dt>
                <dd>{selected.username}</dd>
              </div>
              <div>
                <dt>Onboarded</dt>
                <dd>
                  {new Date(selected.created + "T12:00:00").toLocaleDateString(
                    "en-GB",
                    { day: "numeric", month: "short", year: "numeric" },
                  )}
                </dd>
              </div>
              <div>
                <dt>Setup scope</dt>
                <dd>{selected.scope}</dd>
              </div>
            </dl>
            <button
              className="am-primary am-full"
              onClick={() => {
                setLoginError("");
                setLogin(true);
              }}
            >
              <LogIn size={16} />
              {activeId === selected.id
                ? "Signed in to this account"
                : "Switch to account"}
              <ArrowUpRight size={16} />
            </button>
            <button className="am-edit" onClick={() => setDrawer("edit")}>
              <Pencil size={14} /> Edit business details
            </button>
          </aside>
        </div>
      </section>
      {/* <p className="am-footnote">
        <span className="am-live-dot" /> Demo data only. Changes last for this
        session.
      </p> */}
      {drawer && (
        <AccountDrawer
          key={drawer + (drawer === "edit" ? selectedId : "new")}
          account={drawer === "edit" ? selected : undefined}
          accounts={accounts}
          onClose={() => setDrawer(null)}
          onSave={save}
        />
      )}
      {login && (
        <div className="am-overlay">
          <dialog
            ref={loginDialog}
            onCancel={() => setLogin(false)}
            className="am-login"
            aria-labelledby="am-login-title"
          >
            <button
              className="am-close"
              aria-label="Close sign in"
              onClick={() => {
                setLogin(false);
                setLoginError("");
              }}
            >
              <X size={20} />
            </button>
            <LogIn size={25} />
            <h2 id="am-login-title">Switch account</h2>
            <p>Sign in with the business’s demo credentials.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const a = accounts.find(
                  (a) =>
                    a.username === data.get("username") &&
                    a.password === data.get("password"),
                );
                if (!a) {
                  setLoginError(
                    "Username or password is incorrect. Check the demo credentials below.",
                  );
                  return;
                }
                setActiveId(a.id);
                setSelectedId(a.id);
                reset();
                setLogin(false);
                setNotice(`You’re now viewing ${a.companyName}.`);
              }}
            >
              <label>
                Username
                <input
                  name="username"
                  defaultValue={selected.username}
                  required
                  autoFocus
                />
              </label>
              <label>
                Password
                <input name="password" type="password" required />
              </label>
              {loginError && (
                <p className="am-error" role="alert">
                  {loginError}
                </p>
              )}
              <div className="am-demo-credentials">
                Demo password for {selected.companyName}:{" "}
                <b>{selected.password}</b>
              </div>
              <button className="am-primary am-full">
                Sign in & switch <ArrowDownLeft size={16} />
              </button>
            </form>
          </dialog>
        </div>
      )}
    </div>
  );
}
