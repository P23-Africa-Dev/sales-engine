"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { OutreachDashboardData, OutreachBusiness } from "@/lib/outreach-dashboard";
import { ActivityDrawer } from "./activity-drawer";
import { BusinessLogo } from "./business-logo";

const asset = (name: string) => `/dashboard-design/${name}`;
const number = (value: number | null | undefined) => (value == null ? "—" : value.toLocaleString("en-US"));

function Avatar({ color }: { color: string }) {
  return (
    <span className="outreach-avatar" style={{ backgroundColor: color }} aria-hidden="true">
      <Image src={asset("338d7.png")} alt="" width={25} height={28} />
    </span>
  );
}

function EmptyIllustration() {
  const layers = [
    ["08585.svg", 0, 0, 150, 150],
    ["65360.svg", 0, 0, 150, 150],
    ["6beb2.svg", 37, 53, 32, 6],
    ["6beb2.svg", 37, 95, 32, 6],
    ["46f5d.svg", 37, 67, 76, 20],
    ["e86a6.svg", 37, 109, 76, 18],
    ["fa249.svg", 49, 24, 52, 8],
    ["56b7c.svg", 78.64, 78, 20.09, 26.871],
  ] as const;

  return (
    <div className="prospect-illustration" aria-hidden="true">
      {layers.map(([file, left, top, width, height], index) => (
        <Image
          key={index}
          src={asset(file)}
          alt=""
          width={width}
          height={height}
          style={{ position: "absolute", left, top }}
        />
      ))}
    </div>
  );
}

export function OutreachDashboardView({ data }: { data: OutreachDashboardData }) {
  const [view, setView] = useState<"businesses" | "outreach">("businesses");
  const [selectedBusinessId, setSelectedBusinessId] = useState(data.defaultBusinessId);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const PAGE_SIZE = 4;

  const selectedBusiness =
    data.businesses.find((item) => item.id === selectedBusinessId) ??
    data.businesses.find((item) => item.id === data.defaultBusinessId) ??
    data.businesses[0];

  const matches = (values: string[]) =>
    values.some((value) => value.toLowerCase().includes(query.trim().toLowerCase()));

  const businesses = data.businesses.filter((item) =>
    matches([item.name, item.industry, item.country, item.website, item.owner])
  );
  const outreach = data.outreach.filter((item) =>
    matches([item.name, item.channel, item.status, item.owner])
  );
  const currentList = view === "businesses" ? businesses : outreach;
  const totalItems = currentList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedList = currentList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const empty = totalItems === 0;

  function selectBusiness(id: string | null) {
    if (id) setSelectedBusinessId(id);
  }

  function getPaginationPages(current: number, total: number) {
    if (total <= 5) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 3) {
      return [1, 2, 3, 4, "...", total];
    }
    if (current >= total - 2) {
      return [1, "...", total - 3, total - 2, total - 1, total];
    }
    return [1, "...", current - 1, current, current + 1, "...", total];
  }

  function businessCells(item: OutreachBusiness) {
    return [
      ["Business", item.name],
      ["Industry", item.industry],
      ["Country", item.country],
      ["Website", item.website],
      ["Account Owner", item.owner],
      ["Created", item.created],
    ];
  }

  return (
    <div className="outreach-dashboard" data-source={data.source}>
      <h1>Outreach</h1>
      <div className="outreach-metrics">
        {data.metrics.map((card) => (
          <article className="outreach-metric" key={card.id}>
            <h2>{card.title}</h2>
            <p className="metric-number">{number(card.total)}</p>
            <div className="outreach-progress">
              {[
                [card.primaryLabel, card.primaryPercent],
                [card.secondaryLabel, card.secondaryPercent],
              ].map(([label, percent], index) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label={String(label) + " " + card.title}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={typeof percent === "number" ? percent : undefined}
                    aria-valuetext={percent == null ? "Unavailable" : undefined}
                  >
                    <div
                      className={index ? "progress-purple" : "progress-mint"}
                      style={{
                        width: `${Math.max(0, Math.min(100, Number(percent) || 0))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="outreach-avatars">
              {Array.from({ length: card.avatars }, (_, index) => (
                <Avatar key={index} color={["#dc9c56", "#f5fdfa", "#b190b6"][index % 3]} />
              ))}
            </div>
          </article>
        ))}
      </div>

      <section className="prospects-panel" aria-label="Businesses and outreach activity">
        <div className="prospects-panel-surface" aria-hidden="true" />
        <div className="prospects-toolbar">
          <button
            type="button"
            className={view === "outreach" ? "selected" : ""}
            onClick={() => {
              setView("outreach");
              setPage(1);
            }}
            aria-pressed={view === "outreach"}
          >
            All Outreach <span>{data.counts.outreach}</span>
          </button>
          <button
            type="button"
            className={view === "businesses" ? "selected" : ""}
            onClick={() => {
              setView("businesses");
              setPage(1);
            }}
            aria-pressed={view === "businesses"}
          >
            All Business <span>{data.counts.businesses}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen((value) => !value)}
            aria-expanded={filterOpen}
            aria-controls="outreach-filter"
          >
            <Image src={asset("6e7f3.svg")} alt="" width={18} height={18} />
            Filter
          </button>
        </div>

        <h2 className="prospects-title">
          {view === "businesses" ? "Number of Businesses" : "All Outreach"}
        </h2>

        <div className="prospects-content">
          <div className="prospect-list">
            {filterOpen && (
              <div id="outreach-filter" className="prospect-filter-bar">
                <div className="prospect-search-box">
                  <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder={view === "businesses" ? "Search businesses, industry, country, owner…" : "Search outreach by name, channel, status, owner…"}
                    autoFocus
                  />
                  {query && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => {
                        setQuery("");
                        setPage(1);
                      }}
                      aria-label="Clear filter"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {query.trim() && (
                  <span className="search-match-badge">
                    {totalItems} {totalItems === 1 ? "match" : "matches"}
                  </span>
                )}
              </div>
            )}

            {empty ? (
              <div className="prospects-empty">
                <EmptyIllustration />
                <p>{query.trim() ? "No matching results" : "No Available Prospects"}</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPage(1);
                  }}
                >
                  Clear filter
                </button>
              </div>
            ) : (
              <>
                <div className="table-responsive">
                  <table
                    className="business-table"
                    role="grid"
                    aria-label={view === "businesses" ? "Businesses" : "Outreach"}
                  >
                    <tbody>
                      {paginatedList.map((item) => {
                        const businessId = "businessId" in item ? item.businessId : item.id;
                        const isSelected = businessId != null && selectedBusiness?.id === businessId;
                        const cells =
                          "industry" in item
                            ? businessCells(item)
                            : [
                                ["Business", item.name],
                                ["Channel", item.channel],
                                ["Status", item.status],
                                ["Account Owner", item.owner],
                                ["Created", item.created],
                              ];

                        return (
                          <tr
                            key={item.id}
                            className={isSelected ? "is-selected" : ""}
                            tabIndex={0}
                            aria-label={`View activity for ${item.name}`}
                            aria-selected={isSelected}
                            onClick={() => selectBusiness(businessId)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                selectBusiness(businessId);
                              }
                            }}
                          >
                            <td className="business-avatar-cell">
                              <BusinessLogo
                                id={businessId}
                                name={item.name}
                                color={item.avatarColor}
                              />
                            </td>
                            {cells.map(([label, value]) => (
                              <td key={label}>
                                <strong>{label}</strong>
                                <span title={value}>{value || "—"}</span>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="prospect-pagination" role="navigation" aria-label="Prospect list pagination">
                    <span className="pagination-info">
                      Showing <strong>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalItems)}</strong> of <strong>{totalItems}</strong> {view === "businesses" ? "businesses" : "outreach"}
                    </span>
                    <div className="pagination-controls">
                      <button
                        type="button"
                        className="pagination-nav-btn"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        aria-label="Previous page"
                      >
                        ‹ Prev
                      </button>
                      <div className="pagination-pages">
                        {getPaginationPages(safePage, totalPages).map((p, idx) =>
                          typeof p === "number" ? (
                            <button
                              key={p}
                              type="button"
                              className={`pagination-number-btn ${p === safePage ? "is-active" : ""}`}
                              onClick={() => setPage(p)}
                              aria-label={`Page ${p}`}
                              aria-current={p === safePage ? "page" : undefined}
                            >
                              {p}
                            </button>
                          ) : (
                            <span key={`ellipsis-${idx}`} className="pagination-ellipsis" aria-hidden="true">
                              …
                            </span>
                          )
                        )}
                      </div>
                      <button
                        type="button"
                        className="pagination-nav-btn"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        aria-label="Next page"
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="activity-overview" aria-label="Activity Overview" aria-live="polite">
            <h2>Activity Overview</h2>
            <div className="activity-summary">
              <div>
                <h3>No of Emails</h3>
                <div className="activity-email">
                  <strong>{number(selectedBusiness?.emailsSent)}</strong>
                  <span>Sent</span>
                </div>
              </div>
              <div>
                <h3>Company</h3>
                <strong className="activity-company" title={selectedBusiness?.company}>
                  {selectedBusiness?.company || "—"}
                </strong>
              </div>
            </div>
            <div className="activity-stats">
              <div>
                <Image src={asset("fa628.svg")} alt="" width={18} height={18} />
                <strong>{number(selectedBusiness?.prospects)}</strong>
                <span>No of Prospects</span>
              </div>
              <div>
                <Image src={asset("fa628.svg")} alt="" width={18} height={18} />
                <strong>{number(selectedBusiness?.followUpsCompleted)}</strong>
                <span>Follow-ups Completed</span>
              </div>
            </div>
            <button
              type="button"
              className="open-accounts"
              onClick={() => setDrawerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
            >
              View Full Activities
            </button>
          </aside>
        </div>
      </section>

      <ActivityDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        business={selectedBusiness}
        onOpenAccount={(b) => {
          console.log("Account opened for:", b.name);
        }}
      />
    </div>
  );
}
