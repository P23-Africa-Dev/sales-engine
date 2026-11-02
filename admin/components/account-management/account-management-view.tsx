"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Check,
  Search,
  Plus,
  Pencil,
  Users,
  X,
} from "lucide-react";
import { AccountDrawer } from "./account-drawer";
import type { Account, AccountInput } from "./types";
import {
  createAdminOrganization,
  getAdminOrganization,
  listAdminOrganizations,
  updateAdminOrganization,
  type AdminOrganization,
} from "@/lib/api/admin-organizations";
import { AdminApiError } from "@/lib/api/admin-client";
import "./account-management.css";

const number = (n: number) => n.toLocaleString();
const initials = (s: string) =>
  s
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

const AVATARS = ["#087f83", "#7856a5", "#4766aa", "#a76a27", "#a35c74", "#407b67"];

function mapOrg(org: AdminOrganization): Account {
  const statusMap: Record<string, Account["status"]> = {
    active: "Active",
    pending: "Pending",
    inactive: "Inactive",
  };
  return {
    id: String(org.id),
    companyName: org.name,
    industry: org.industry || "—",
    created: org.created_at ? org.created_at.slice(0, 10) : "",
    status: statusMap[org.status] ?? "Pending",
    prospectPool: org.prospect_pool,
    avatarColor: AVATARS[org.id % AVATARS.length],
    country: org.country || "—",
    owner: org.owner?.name || "Invited owner",
    ownerEmail: org.owner?.email || "",
    scope: org.scope || org.purpose || "Email outreach & lead discovery",
  };
}

function poolParam(pool: string) {
  if (pool === "small") return "lt_1000";
  if (pool === "medium") return "1000_2999";
  if (pool === "large") return "gte_3000";
  return undefined;
}

export function AccountManagementView() {
  const searchParams = useSearchParams();
  const deepLinkOrgId = searchParams.get("organization_id");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("");
  const [pool, setPool] = useState("");
  const [status, setStatus] = useState("All businesses");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<"create" | "edit" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const statusFilter =
        status === "All businesses" ? "all" : status.toLowerCase();
      const result = await listAdminOrganizations({
        search: query || undefined,
        industry: industry || undefined,
        status: statusFilter,
        pool: poolParam(pool),
        page,
        per_page: 6,
      });
      let mapped = result.data.map(mapOrg);
      setTotal(result.meta.total);
      setLastPage(result.meta.last_page);

      if (deepLinkOrgId && !mapped.some((a) => a.id === deepLinkOrgId)) {
        try {
          const detail = await getAdminOrganization(Number(deepLinkOrgId));
          mapped = [mapOrg(detail.data), ...mapped.filter((a) => a.id !== deepLinkOrgId)];
        } catch {
          /* ignore missing deep-link org */
        }
      }

      setAccounts(mapped);
      setSelectedId((prev) => {
        if (deepLinkOrgId && mapped.some((a) => a.id === deepLinkOrgId)) {
          return deepLinkOrgId;
        }
        if (prev && mapped.some((a) => a.id === prev)) return prev;
        return mapped[0]?.id ?? "";
      });
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to load organizations.",
      );
    } finally {
      setLoading(false);
    }
  }, [query, industry, pool, status, page, deepLinkOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = accounts.find((a) => a.id === selectedId);
  const industries = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.industry).filter((v) => v && v !== "—"))).sort(),
    [accounts],
  );

  function reset() {
    setQuery("");
    setIndustry("");
    setPool("");
    setStatus("All businesses");
    setPage(1);
  }

  async function save(input: AccountInput) {
    try {
      if (drawer === "edit" && selectedId) {
        await updateAdminOrganization(Number(selectedId), {
          name: input.companyName,
          industry: input.industry,
          country: input.country,
          scope: input.scope,
        });
        setNotice("Business details updated.");
      } else {
        const created = await createAdminOrganization({
          name: input.companyName,
          owner_email: input.ownerEmail,
          industry: input.industry,
          country: input.country,
          scope: input.scope,
        });
        setNotice(
          `${created.data.name} created. Invitation sent to ${created.invitation_email}.`,
        );
        setPage(1);
      }
      setDrawer(null);
      await load();
    } catch (err) {
      return err instanceof AdminApiError
        ? err.message
        : "Unable to save organization.";
    }
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
          <strong>{String(total).padStart(2, "0")}</strong>
          <small>Across the platform</small>
        </div>
        <div>
          <span>
            <Check size={17} /> Active businesses
          </span>
          <strong>
            {String(accounts.filter((a) => a.status === "Active").length).padStart(2, "0")}
          </strong>
          <small>On this page</small>
        </div>
        <div>
          <span>
            <Users size={17} /> Prospect pool
          </span>
          <strong>
            {number(accounts.reduce((sum, a) => sum + a.prospectPool, 0))}
          </strong>
          <small>Leads on this page</small>
        </div>
      </div>

      {notice && (
        <div className="am-notice" role="status">
          <Check size={16} />
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <div className="am-notice" role="alert">
          {error}
          <button onClick={() => void load()} aria-label="Retry">
            Retry
          </button>
        </div>
      )}

      <div className="am-layout">
        <section className="am-directory">
          <div className="am-filters">
            <label className="am-search">
              <Search size={16} />
              <input
                placeholder="Search business, owner or email…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <select
              value={industry}
              onChange={(e) => {
                setIndustry(e.target.value);
                setPage(1);
              }}
              aria-label="Industry"
            >
              <option value="">All industries</option>
              {industries.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={pool}
              onChange={(e) => {
                setPool(e.target.value);
                setPage(1);
              }}
              aria-label="Prospect pool"
            >
              <option value="">Any pool size</option>
              <option value="small">Under 1,000</option>
              <option value="medium">1,000–2,999</option>
              <option value="large">3,000 or more</option>
            </select>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              aria-label="Status"
            >
              <option>All businesses</option>
              <option>Active</option>
              <option>Pending</option>
              <option>Inactive</option>
            </select>
            <button onClick={reset} className="am-reset">
              Clear filters
            </button>
          </div>

          <div className="am-table-wrap">
            {loading ? (
              <p className="am-empty">Loading organizations…</p>
            ) : accounts.length === 0 ? (
              <div className="am-empty">
                <p>No businesses match these filters.</p>
                <button onClick={reset}>Clear filters</button>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Industry</th>
                    <th>Owner</th>
                    <th>Prospects</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr
                      key={a.id}
                      className={a.id === selectedId ? "is-selected" : ""}
                      onClick={() => setSelectedId(a.id)}
                    >
                      <td>
                        <button
                          type="button"
                          onClick={() => setSelectedId(a.id)}
                        >
                          <span
                            className="am-avatar"
                            style={{ background: a.avatarColor }}
                          >
                            {initials(a.companyName)}
                          </span>
                          {a.companyName}
                        </button>
                      </td>
                      <td>{a.industry}</td>
                      <td>{a.owner}</td>
                      <td>{number(a.prospectPool)}</td>
                      <td>
                        <span className={`am-status is-${a.status.toLowerCase()}`}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="am-pagination">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {lastPage}
            </span>
            <button
              disabled={page >= lastPage}
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </section>

        <aside className="am-detail">
          {selected ? (
            <>
              <div className="am-detail-head">
                <span
                  className="am-avatar am-avatar-lg"
                  style={{ background: selected.avatarColor }}
                >
                  {initials(selected.companyName)}
                </span>
                <div>
                  <h2>{selected.companyName}</h2>
                  <p>
                    {selected.industry} · {selected.country}
                  </p>
                </div>
                <button
                  className="am-edit"
                  onClick={() => setDrawer("edit")}
                  aria-label="Edit business"
                >
                  <Pencil size={16} />
                </button>
              </div>
              <dl>
                <div>
                  <dt>Owner</dt>
                  <dd>{selected.owner}</dd>
                </div>
                <div>
                  <dt>Owner email</dt>
                  <dd>{selected.ownerEmail || "Invitation pending"}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{selected.created || "—"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selected.status}</dd>
                </div>
                <div>
                  <dt>Setup scope</dt>
                  <dd>{selected.scope}</dd>
                </div>
                <div className="am-pool">
                  <dt>Prospect pool</dt>
                  <dd>{number(selected.prospectPool)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="am-empty">Select a business to inspect details.</p>
          )}
        </aside>
      </div>

      {drawer && (
        <AccountDrawer
          account={drawer === "edit" ? selected : undefined}
          accounts={accounts}
          onClose={() => setDrawer(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
