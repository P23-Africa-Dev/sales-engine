"use client";
import { useState, type CSSProperties } from "react";
import { ChartPanel, ChartTooltip } from "@/components/crm/crm-charts";
import {
  getBusinessVelocityData,
  type OnboardedBusiness,
  type ProspectTier,
} from "@/lib/smart-leads";
export const TIER_LABELS = {
  high: "High intent",
  middle: "Medium intent",
  low: "Low intent",
};
const tiers: ProspectTier[] = ["high", "middle", "low"];
export function SmartLeadsAnalytics({
  business,
  onTier,
  onSignal,
  selectedSignal,
}: {
  business: OnboardedBusiness;
  onTier: (tier: ProspectTier) => void;
  onSignal: (signal: string) => void;
  selectedSignal: string;
}) {
  const [metric, setMetric] = useState<"touches" | "opens" | "meetings">(
    "touches",
  );
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [hoverSignal, setHoverSignal] = useState<string | null>(null);
  const [hoverTier, setHoverTier] = useState<ProspectTier | null>(null);
  const data = getBusinessVelocityData(business.id);
  const max = Math.max(1, ...data.map((d) => d[metric]));
  const palette = ["#d88bec", "#2ae9c9", "#f4c789"];
  const tierFractions = tiers.map(
    (tier) =>
      business.prospects.filter((p) => p.tier === tier).length /
      Math.max(1, business.prospects.length),
  );
  const tierStarts = tierFractions.map((_, index) =>
    tierFractions.slice(0, index).reduce((sum, value) => sum + value, 0),
  );
  return (
    <>
      <div className="sp-analytics">
        <ChartPanel className="crm-source-chart sp-intent-chart">
          <div className="sl-panel-head">
            <div>
              <h2>Intent distribution</h2>
              <p>
                Inspect the prospect mix in {business.company}’s sample pool.
              </p>
            </div>
          </div>
          <div className="crm-donut">
            {hoverTier && (
              <ChartTooltip>
                <strong>{TIER_LABELS[hoverTier]}</strong>
                <span>
                  {
                    business.prospects.filter((p) => p.tier === hoverTier)
                      .length
                  }{" "}
                  prospects
                </span>
              </ChartTooltip>
            )}
            <svg
              viewBox="0 0 240 240"
              role="group"
              aria-label="Prospect intent distribution"
            >
              <circle
                cx="120"
                cy="120"
                r="88"
                fill="none"
                stroke="#705b71"
                strokeWidth="25"
              />
              {tiers.map((tier, i) => {
                const count = business.prospects.filter(
                  (p) => p.tier === tier,
                ).length;
                const fraction = tierFractions[i];
                const start = tierStarts[i];
                return count ? (
                  <circle
                    key={`${business.id}-${tier}`}
                    cx="120"
                    cy="120"
                    r="88"
                    stroke={palette[i]}
                    strokeWidth={hoverTier === tier ? 31 : 25}
                    fill="none"
                    pathLength="1"
                    strokeDasharray={`${Math.max(0, fraction - 0.012)} 1`}
                    strokeDashoffset={-start}
                    transform="rotate(-90 120 120)"
                    className="crm-donut-segment crm-animated"
                    style={
                      {
                        "--crm-segment": Math.max(0, fraction - 0.012),
                      } as CSSProperties
                    }
                    tabIndex={0}
                    role="button"
                    aria-label={`Filter ${TIER_LABELS[tier]}: ${count} prospects`}
                    onClick={() => onTier(tier)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onTier(tier);
                      }
                    }}
                    onMouseEnter={() => setHoverTier(tier)}
                    onMouseLeave={() => setHoverTier(null)}
                    onFocus={() => setHoverTier(tier)}
                    onBlur={() => setHoverTier(null)}
                  />
                ) : null;
              })}
            </svg>
            <div className="crm-donut-center">
              <strong>
                {hoverTier
                  ? business.prospects.filter((p) => p.tier === hoverTier)
                      .length
                  : business.prospects.length}
              </strong>
              <span>
                {hoverTier ? TIER_LABELS[hoverTier] : "sample prospects"}
              </span>
            </div>
          </div>
          <div className="crm-source-legend">
            {tiers.map((tier, i) => {
              const count = business.prospects.filter(
                (p) => p.tier === tier,
              ).length;
              return (
                <button
                  key={tier}
                  onClick={() => onTier(tier)}
                  onMouseEnter={() => setHoverTier(tier)}
                  onMouseLeave={() => setHoverTier(null)}
                  onFocus={() => setHoverTier(tier)}
                  onBlur={() => setHoverTier(null)}
                >
                  <span>
                    <i
                      className="sp-legend-dot"
                      style={{ background: palette[i] }}
                    />
                    {TIER_LABELS[tier]}
                  </span>
                  <strong>
                    {count}
                    <small>
                      {Math.round(
                        (count / Math.max(1, business.prospects.length)) * 100,
                      )}
                      %
                    </small>
                  </strong>
                </button>
              );
            })}
          </div>
        </ChartPanel>
        <ChartPanel className="sp-velocity-chart">
          <div className="sl-panel-head">
            <div>
              <h2>Outreach activity</h2>
              <p>14-day illustrative cadence history for this client.</p>
            </div>
          </div>
          <div
            className="crm-period sp-velocity-switch"
            aria-label="Outreach activity metric"
          >
            {(
              [
                { key: "touches", label: "Touches" },
                { key: "opens", label: "Opens" },
                { key: "meetings", label: "Meetings" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                aria-pressed={metric === item.key}
                onClick={() => {
                  setMetric(item.key);
                  setHoverDay(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="sp-velocity-summary">
            <strong>{data.reduce((sum, d) => sum + d[metric], 0)}</strong>
            <span>{metric} across 14 sample days</span>
          </div>
          <div className="sp-velocity-bars" key={`${business.id}-${metric}`}>
            {data.map((d, i) => (
              <div
                key={d.day}
                className="sp-velocity-column"
                tabIndex={0}
                role="img"
                aria-label={`${d.day}: ${d[metric]} ${metric}`}
                onMouseEnter={() => setHoverDay(i)}
                onMouseLeave={() => setHoverDay(null)}
                onFocus={() => setHoverDay(i)}
                onBlur={() => setHoverDay(null)}
              >
                {hoverDay === i && (
                  <ChartTooltip>
                    <strong>{d.day}</strong>
                    <span>
                      {d[metric]} {metric}
                    </span>
                  </ChartTooltip>
                )}
                <span className="sp-velocity-track">
                  <span
                    className="sp-velocity-fill crm-animated"
                    style={{
                      height: `${(d[metric] / max) * 100}%`,
                      animationDelay: `${i * 25}ms`,
                    }}
                  />
                </span>
                <small>
                  {i === 0 || i === 13 || i % 3 === 0 ? `${i + 1}` : ""}
                </small>
              </div>
            ))}
          </div>
          <p className="sp-chart-note">
            Sample day number · hover or focus a bar for exact values.
          </p>
        </ChartPanel>
      </div>
      <ChartPanel className="sp-signals">
        <div className="sl-panel-head">
          <div>
            <h2>Buying-signal coverage</h2>
            <p>
              Share of this client’s sample pool matching each buying signal.
            </p>
          </div>
        </div>
        <div
          className="sp-coverage-chart"
          role="group"
          aria-label="Buying-signal coverage chart"
        >
          <div className="sp-coverage-axis">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
          {[
            { key: "hiring", name: "Hiring growth" },
            { key: "funding", name: "Funding" },
            { key: "expansion", name: "Expansion" },
            { key: "tenders", name: "Tenders" },
          ].map((item) => {
            const count = business.prospects.filter((p) =>
              p.matchedPresets.includes(item.key),
            ).length;
            return (
              <button
                key={item.key}
                className="sp-coverage-row"
                aria-label={`${item.name}: ${count} of ${business.prospects.length} prospects, ${Math.round((count / Math.max(1, business.prospects.length)) * 100)} percent. Filter prospects`}
                onMouseEnter={() => setHoverSignal(item.key)}
                onMouseLeave={() => setHoverSignal(null)}
                onFocus={() => setHoverSignal(item.key)}
                onBlur={() => setHoverSignal(null)}
                aria-pressed={selectedSignal === item.key}
                onClick={() =>
                  onSignal(selectedSignal === item.key ? "all" : item.key)
                }
              >
                <span>{item.name}</span>
                <span className="sp-coverage-plot">
                  {hoverSignal === item.key && (
                    <ChartTooltip>
                      <strong>{item.name}</strong>
                      <span>
                        {count} of {business.prospects.length} prospects ·{" "}
                        {Math.round(
                          (count / Math.max(1, business.prospects.length)) *
                            100,
                        )}
                        %
                      </span>
                    </ChartTooltip>
                  )}
                  <span className="sp-signal-track">
                    <span
                      className="crm-animated sp-coverage-fill"
                      style={{
                        width: `${(count / Math.max(1, business.prospects.length)) * 100}%`,
                      }}
                    />
                  </span>
                </span>
                <strong>
                  {count}
                  <small> {count === 1 ? "prospect" : "prospects"}</small>
                </strong>
              </button>
            );
          })}
        </div>
        <p className="sl-footnote">
          Counts use the displayed sample records. A prospect can match more
          than one buying signal.
        </p>
      </ChartPanel>
    </>
  );
}
