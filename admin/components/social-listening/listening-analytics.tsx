"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import {
  SOURCES,
  type ListeningBusiness,
  type Signal,
} from "@/lib/social-listening";

const sourceColors = ["#2ae9c9", "#d88bec", "#f4c789", "#a6c3fa"];
const states = ["Approved", "Needs review", "Suppressed"] as const;
const stageNames = ["Awareness", "Consideration", "Decision"];
const shortDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
function ScrollChart({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <section
      ref={ref}
      className={`${className} ${visible ? "sla-in-view" : ""}`}
    >
      {children}
    </section>
  );
}
function Tooltip({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span role="tooltip" className="sla-tooltip" style={style}>
      {children}
    </span>
  );
}
function Legend({ label, color }: { label: string; color: string }) {
  return (
    <span className="sla-legend">
      <i style={{ background: color }} />
      {label}
    </span>
  );
}
function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="sla-data">
      <summary>View chart data</summary>
      <div className="sl-table-wrap">
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
function curve(points: { x: number; y: number }[]) {
  return points.reduce((path, p, i) => {
    if (!i) return `M ${p.x} ${p.y}`;
    const before = points[i - 1];
    const middle = (before.x + p.x) / 2;
    return `${path} C ${middle} ${before.y}, ${middle} ${p.y}, ${p.x} ${p.y}`;
  }, "");
}

export function ListeningAnalytics({
  signals,
  businesses,
  onBusiness,
}: {
  signals: Signal[];
  businesses: ListeningBusiness[];
  onBusiness: (id: string) => void;
}) {
  const [days, setDays] = useState(14);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [hoverSource, setHoverSource] = useState<number | null>(null);
  const [hoverBusiness, setHoverBusiness] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<number | null>(null);
  const gradientId = `signal-area-${useId().replaceAll(":", "")}`;
  const snapshot = "2026-10-09";
  const end = new Date(`${snapshot}T00:00:00Z`);
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - days + 1 + i);
    const iso = date.toISOString().slice(0, 10);
    const items = signals.filter((s) => s.date === iso);
    return {
      date: iso,
      total: items.length,
      approved: items.filter((s) => s.status === "Approved").length,
    };
  });
  const peak = Math.max(1, ...daily.map((d) => d.total));
  const axisMax = Math.max(4, Math.ceil(peak / 4) * 4);
  const x = (i: number) => 44 + (i * 608) / (days - 1);
  const y = (v: number) => 208 - (v / axisMax) * 168;
  const totalPoints = daily.map((d, i) => ({ x: x(i), y: y(d.total) }));
  const approvedPoints = daily.map((d, i) => ({ x: x(i), y: y(d.approved) }));
  const line = curve(totalPoints);
  const periodTotal = daily.reduce((sum, d) => sum + d.total, 0);
  const approved = signals.filter((s) => s.status === "Approved").length;
  const sources = SOURCES.map((name, i) => ({
    name,
    count: signals.filter((s) => s.source === name).length,
    color: sourceColors[i],
  }));
  const hovered = hoverDay === null ? null : daily[hoverDay];
  const activeSource = hoverSource === null ? null : sources[hoverSource];
  const barMax = Math.max(
    1,
    ...businesses.map(
      (b) => signals.filter((s) => s.businessId === b.id).length,
    ),
  );
  const sourceStarts = sources.map((_, index) =>
    sources
      .slice(0, index)
      .reduce(
        (sum, item) => sum + item.count / Math.max(1, signals.length),
        0,
      ),
  );
  const animationKey = `${signals.map((s) => `${s.id}:${s.status}`).join("|")}-${days}`;
  return (
    <div className="sla-grid">
      <ScrollChart className="sl-panel sla-trend">
        <div className="sl-panel-head">
          <div>
            <h2>Signal momentum</h2>
            <p>Daily captures and their current review outcome.</p>
          </div>
          <div className="sla-period" aria-label="Trend date range">
            {[7, 14].map((n) => (
              <button
                key={n}
                aria-pressed={days === n}
                onClick={() => {
                  setDays(n);
                  setHoverDay(null);
                }}
              >
                {n} days
              </button>
            ))}
          </div>
        </div>
        <div className="sla-trend-summary">
          <div>
            <strong>{periodTotal}</strong>
            <span>signals captured</span>
          </div>
          <span className="sla-date-range">
            {shortDate(daily[0].date)} — {shortDate(snapshot)} 2026
          </span>
          <div className="sla-legends">
            <Legend label="Captured" color="#784880" />
            <Legend label="Approved" color="#0b887b" />
          </div>
        </div>
        <div className="sla-trend-chart">
          {hovered && (
            <Tooltip
              style={{
                left: `${Math.min(72, Math.max(12, (x(hoverDay!) / 680) * 100))}%`,
              }}
            >
              <strong>{shortDate(hovered.date)}</strong>
              <span>{hovered.total} captured</span>
              <span>{hovered.approved} approved</span>
            </Tooltip>
          )}
          <svg
            viewBox="0 0 680 250"
            role="group"
            aria-label={`Daily signal captures from ${shortDate(daily[0].date)} to ${shortDate(snapshot)}. Use Tab to inspect each date.`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a36bae" stopOpacity=".22" />
                <stop offset="100%" stopColor="#a36bae" stopOpacity=".01" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <line
                  x1="44"
                  x2="652"
                  y1={y((i * axisMax) / 4)}
                  y2={y((i * axisMax) / 4)}
                  className="sla-gridline"
                />
                <text x="28" y={y((i * axisMax) / 4) + 4} textAnchor="end">
                  {(i * axisMax) / 4}
                </text>
              </g>
            ))}
            <g key={animationKey}>
              <path
                d={`${line} L 652 208 L 44 208 Z`}
                fill={`url(#${gradientId})`}
                className="sla-area"
              />
              <path
                d={line}
                fill="none"
                stroke="#784880"
                strokeWidth="3"
                pathLength="1"
                className="sla-line"
              />
              <path
                d={curve(approvedPoints)}
                fill="none"
                stroke="#0b887b"
                strokeWidth="2.5"
                pathLength="1"
                className="sla-line sla-approved-line"
              />
            </g>
            {daily.map((d, i) => (
              <g key={d.date}>
                {(i === 0 ||
                  i === days - 1 ||
                  (i % (days === 14 ? 3 : 2) === 0 && i < days - 2)) && (
                  <text x={x(i)} y="236" textAnchor="middle">
                    {shortDate(d.date)}
                  </text>
                )}
                <circle
                  cx={x(i)}
                  cy={y(d.total)}
                  r={hoverDay === i ? 6 : 3.5}
                  fill="#fff"
                  stroke="#784880"
                  strokeWidth="2"
                />
                <rect
                  x={x(i) - Math.min(18, 608 / (days - 1) / 2)}
                  y="30"
                  width={Math.min(36, 608 / (days - 1))}
                  height="184"
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${shortDate(d.date)}: ${d.total} captured, ${d.approved} approved`}
                  onMouseEnter={() => setHoverDay(i)}
                  onMouseLeave={() => setHoverDay(null)}
                  onFocus={() => setHoverDay(i)}
                  onBlur={() => setHoverDay(null)}
                  className="sla-hit"
                />
              </g>
            ))}
            {hoverDay !== null && (
              <line
                x1={x(hoverDay)}
                x2={x(hoverDay)}
                y1="32"
                y2="208"
                className="sla-crosshair"
              />
            )}
          </svg>
          <div className="sla-chart-readout" aria-live="polite">
            {hovered ? (
              <>
                <strong>{shortDate(hovered.date)}</strong>
                <span>
                  {hovered.total} captured · {hovered.approved} approved
                </span>
              </>
            ) : (
              <>
                <ChartNoAxesCombined size={15} />
                <span>Hover or focus a date to inspect signal activity</span>
              </>
            )}
          </div>
        </div>
        <DataTable
          headers={["Date", "Captured", "Currently approved"]}
          rows={daily.map((d) => [shortDate(d.date), d.total, d.approved])}
        />
      </ScrollChart>
      <ScrollChart className="sl-panel sla-source">
        <div className="sl-panel-head">
          <div>
            <h2>Source distribution</h2>
            <p>The channels behind your signal pool.</p>
          </div>
        </div>
        <div className="sla-donut-wrap">
          {activeSource && (
            <Tooltip>
              <strong>{activeSource.name}</strong>
              <span>
                {activeSource.count} signals ·{" "}
                {Math.round(
                  (activeSource.count / Math.max(1, signals.length)) * 100,
                )}
                %
              </span>
            </Tooltip>
          )}
          <svg
            viewBox="0 0 240 240"
            role="group"
            aria-label="Source distribution donut chart"
          >
            <circle
              cx="120"
              cy="120"
              r="88"
              fill="none"
              stroke="#705b71"
              strokeWidth="25"
            />
            {sources.map((s, i) => {
              const fraction = s.count / Math.max(1, signals.length);
              const start = sourceStarts[i];
              if (!s.count) return null;
              return (
                <circle
                  key={`${s.name}-${s.count}`}
                  cx="120"
                  cy="120"
                  r="88"
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hoverSource === i ? 31 : 25}
                  pathLength="1"
                  strokeDasharray={`${Math.max(0, fraction - 0.012)} ${1 - Math.max(0, fraction - 0.012)}`}
                  strokeDashoffset={-start}
                  transform="rotate(-90 120 120)"
                  className="sla-donut-segment"
                  tabIndex={0}
                  role="img"
                  aria-label={`${s.name}: ${s.count} signals, ${Math.round(fraction * 100)} percent`}
                  style={
                    {
                      "--segment-length": Math.max(0, fraction - 0.012),
                    } as CSSProperties
                  }
                  onMouseEnter={() => setHoverSource(i)}
                  onMouseLeave={() => setHoverSource(null)}
                  onFocus={() => setHoverSource(i)}
                  onBlur={() => setHoverSource(null)}
                />
              );
            })}
          </svg>
          <div className="sla-donut-center" aria-live="polite">
            <strong>{activeSource?.count ?? signals.length}</strong>
            <span>{activeSource?.name ?? "total signals"}</span>
          </div>
        </div>
        <div className="sla-source-legend">
          {sources.map((s, i) => (
            <button
              key={s.name}
              onMouseEnter={() => setHoverSource(i)}
              onMouseLeave={() => setHoverSource(null)}
              onFocus={() => setHoverSource(i)}
              onBlur={() => setHoverSource(null)}
              onClick={() => setHoverSource(i)}
              aria-pressed={hoverSource === i}
              aria-label={`${s.name}: ${s.count} signals, ${Math.round((s.count / Math.max(1, signals.length)) * 100)} percent`}
            >
              <Legend label={s.name} color={s.color} />
              <strong>
                {s.count}
                <small>
                  {Math.round((s.count / Math.max(1, signals.length)) * 100)}%
                </small>
              </strong>
            </button>
          ))}
        </div>
        <p className="sla-chart-note">
          All captured signals, including historical sources now disabled.
        </p>
      </ScrollChart>
      <ScrollChart className="sl-panel sla-business-chart">
        <div className="sl-panel-head">
          <div>
            <h2>Review balance by client</h2>
            <p>Compare signal volume and the work still waiting.</p>
          </div>
          <span className="sl-badge">{businesses.length} clients</span>
        </div>
        <div className="sla-legends sla-bar-legend">
          <Legend label="Approved" color="#087b6e" />
          <Legend label="Needs review" color="#9561a6" />
          <Legend label="Suppressed" color="#b9b3c5" />
        </div>
        <div className="sla-bars" key={animationKey}>
          <div className="sla-bar-axis">
            <span>{barMax}</span>
            <span>{Math.round(barMax / 2)}</span>
            <span>0</span>
          </div>
          <div className="sla-bar-plot">
            {businesses.map((b, i) => {
              const items = signals.filter((s) => s.businessId === b.id);
              return (
                <button
                  className="sla-business-bar"
                  key={b.id}
                  onClick={() => onBusiness(b.id)}
                  onMouseEnter={() => setHoverBusiness(b.id)}
                  onMouseLeave={() => setHoverBusiness(null)}
                  onFocus={() => setHoverBusiness(b.id)}
                  onBlur={() => setHoverBusiness(null)}
                  aria-label={`Inspect ${b.name}: ${items.length} signals, ${items.filter((s) => s.status === "Needs review").length} awaiting review`}
                >
                  {hoverBusiness === b.id && (
                    <Tooltip>
                      <strong>{b.name}</strong>
                      {states.map((status) => (
                        <span key={status}>
                          {status}:{" "}
                          {items.filter((s) => s.status === status).length}
                        </span>
                      ))}
                    </Tooltip>
                  )}
                  <span className="sla-bar-total">{items.length}</span>
                  <span
                    className="sla-column"
                    style={{
                      height: `${(items.length / barMax) * 160}px`,
                      animationDelay: `${i * 65}ms`,
                    }}
                  >
                    {states.map((status) => {
                      const count = items.filter(
                        (s) => s.status === status,
                      ).length;
                      return count ? (
                        <span
                          key={status}
                          className={`sla-stack sla-stack-${status.replaceAll(" ", "-").toLowerCase()}`}
                          style={{ flex: count }}
                          title={`${status}: ${count}`}
                        >
                          {count}
                        </span>
                      ) : null;
                    })}
                  </span>
                  <span className="sla-business-name">
                    {b.name}
                    <ArrowUpRight size={12} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <DataTable
          headers={["Client", "Approved", "Needs review", "Suppressed"]}
          rows={businesses.map((b) => [
            b.name,
            ...states.map(
              (status) =>
                signals.filter(
                  (s) => s.businessId === b.id && s.status === status,
                ).length,
            ),
          ])}
        />
      </ScrollChart>
      <ScrollChart className="sl-panel sla-stage-chart">
        <div className="sl-panel-head">
          <div>
            <h2>Buying-stage mix</h2>
            <p>Understand how close prospects are to a decision.</p>
          </div>
        </div>
        <div className="sla-stage-summary">
          <strong>
            {signals.length ? Math.round((approved / signals.length) * 100) : 0}
            %
          </strong>
          <div>
            of signals approved
            <small>
              {approved} of {signals.length} signals approved
            </small>
          </div>
        </div>
        <div className="sla-stages">
          {stageNames.map((stage, i) => {
            const items = signals.filter((s) => s.stage === stage);
            const share = (items.length / Math.max(1, signals.length)) * 100;
            const score = items.length
              ? Math.round(
                  items.reduce((sum, s) => sum + s.score, 0) / items.length,
                )
              : 0;
            return (
              <div
                key={stage}
                className="sla-stage-point"
                tabIndex={0}
                role="img"
                aria-label={`${stage}: ${items.length} signals, ${Math.round(share)} percent, average intent ${score} out of 100`}
                onMouseEnter={() => setHoverStage(i)}
                onMouseLeave={() => setHoverStage(null)}
                onFocus={() => setHoverStage(i)}
                onBlur={() => setHoverStage(null)}
              >
                {hoverStage === i && (
                  <Tooltip>
                    <strong>{stage}</strong>
                    <span>
                      {items.length} signals · {Math.round(share)}%
                    </span>
                    <span>Average intent: {score}/100</span>
                  </Tooltip>
                )}
                <div className="sla-stage-label">
                  <strong>{stage}</strong>
                  <span>
                    {items.length} signals · {Math.round(share)}%
                  </span>
                </div>
                <div className={`sla-stage-track sla-stage-${i}`}>
                  <span
                    key={`${stage}-${items.length}-${signals.length}`}
                    style={{ width: `${share}%` }}
                  />
                </div>
                <small>
                  {items.length
                    ? `${score}/100 average intent score`
                    : "No signals at this stage"}
                </small>
              </div>
            );
          })}
        </div>
        <DataTable
          headers={["Buying stage", "Signals", "Share"]}
          rows={stageNames.map((stage) => {
            const count = signals.filter((s) => s.stage === stage).length;
            return [
              stage,
              count,
              `${Math.round((count / Math.max(1, signals.length)) * 100)}%`,
            ];
          })}
        />
      </ScrollChart>
    </div>
  );
}
