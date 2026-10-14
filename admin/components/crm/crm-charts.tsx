"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ArrowUpRight } from "lucide-react";
import {
  CRM_SNAPSHOT,
  CRM_SOURCES,
  CRM_STAGES,
  dateLabel,
  daysBefore,
  isOpen,
  money,
  type CrmBusiness,
  type CrmRecord,
} from "@/lib/admin-crm";
export function ChartPanel({
  className = "",
  children,
}: {
  className?: string;
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
      className={`sl-panel crm-chart ${visible ? "is-visible" : ""} ${className}`}
    >
      {children}
    </section>
  );
}
export function ChartTooltip({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span className="crm-tooltip" role="tooltip" style={style}>
      {children}
    </span>
  );
}
function Legend({ label, color }: { label: string; color: string }) {
  return (
    <span className="crm-legend">
      <i style={{ background: color }} />
      {label}
    </span>
  );
}
function ChartData({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="crm-chart-data">
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
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((value, j) => (
                  <td key={j}>{value}</td>
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
    const prev = points[i - 1];
    const m = (p.x + prev.x) / 2;
    return `${path} C ${m} ${prev.y}, ${m} ${p.y}, ${p.x} ${p.y}`;
  }, "");
}
export function CrmCharts({
  records,
  businesses,
  onBusiness,
  onStage,
}: {
  records: CrmRecord[];
  businesses: CrmBusiness[];
  onBusiness: (id: string) => void;
  onStage: (stage: string) => void;
}) {
  const [period, setPeriod] = useState(14);
  const [point, setPoint] = useState<number | null>(null);
  const [sourcePoint, setSourcePoint] = useState<number | null>(null);
  const [clientPoint, setClientPoint] = useState<string | null>(null);
  const [stagePoint, setStagePoint] = useState<string | null>(null);
  const id = useId().replaceAll(":", "");
  const data = Array.from({ length: period }, (_, i) => {
    const date = daysBefore(period - 1 - i);
    const matches = records.filter((r) => r.created === date);
    return { date, total: matches.length, open: matches.filter(isOpen).length };
  });
  const max = Math.max(4, ...data.map((d) => d.total));
  const x = (i: number) => 44 + (608 * i) / (period - 1);
  const y = (count: number) => 205 - (count / max) * 160;
  const total = curve(data.map((d, i) => ({ x: x(i), y: y(d.total) })));
  const active = point === null ? null : data[point];
  const palette = ["#2ae9c9", "#d88bec", "#f4c789"];
  const sources = CRM_SOURCES.map((source, i) => ({
    source,
    count: records.filter((r) => r.source === source).length,
    color: palette[i],
  }));
  let offset = 0;
  const clients = businesses.map((b) => {
    const matches = records.filter((r) => r.businessId === b.id);
    return {
      ...b,
      open: matches.filter(isOpen).reduce((sum, r) => sum + r.value, 0),
      won: matches
        .filter((r) => r.stage === "Won")
        .reduce((sum, r) => sum + r.value, 0),
    };
  });
  const valueMax = Math.max(1, ...clients.flatMap((c) => [c.open, c.won]));
  const openRecords = records.filter(isOpen);
  const key = records.map((r) => `${r.id}:${r.stage}:${r.value}`).join("|");
  return (
    <div className="crm-analytics-grid">
      <ChartPanel className="crm-capture-chart">
        <div className="sl-panel-head">
          <div>
            <h2>Record momentum</h2>
            <p>New records and how many remain in the open pipeline.</p>
          </div>
          <div className="crm-period">
            {[7, 14].map((n) => (
              <button
                key={n}
                aria-pressed={period === n}
                onClick={() => {
                  setPeriod(n);
                  setPoint(null);
                }}
              >
                {n} days
              </button>
            ))}
          </div>
        </div>
        <div className="crm-chart-summary">
          <strong>{data.reduce((sum, d) => sum + d.total, 0)}</strong>
          <span>records created</span>
          <small>
            {dateLabel(data[0].date)} — {dateLabel(CRM_SNAPSHOT)} 2026
          </small>
        </div>
        <div className="crm-legends">
          <Legend label="Created" color="#784880" />
          <Legend label="Currently open" color="#0b887b" />
        </div>
        <div className="crm-line-wrap">
          {active && (
            <ChartTooltip
              style={{
                left: `${Math.min(75, Math.max(15, (x(point!) / 680) * 100))}%`,
              }}
            >
              <strong>{dateLabel(active.date)}</strong>
              <span>{active.total} created</span>
              <span>{active.open} currently open</span>
            </ChartTooltip>
          )}
          <svg
            viewBox="0 0 680 248"
            role="group"
            aria-label="Record creation trend; focus each date for exact values"
          >
            <defs>
              <linearGradient id={`crm-area-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#a36bae" stopOpacity=".23" />
                <stop offset="1" stopColor="#a36bae" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <line
                  x1="44"
                  x2="652"
                  y1={y((max * i) / 4)}
                  y2={y((max * i) / 4)}
                  className="crm-gridline"
                />
                <text x="27" y={y((max * i) / 4) + 4} textAnchor="end">
                  {(max * i) / 4}
                </text>
              </g>
            ))}
            <g key={`${key}-${period}`}>
              <path
                d={`${total} L 652 205 L 44 205 Z`}
                fill={`url(#crm-area-${id})`}
                className="crm-area crm-animated"
              />
              <path
                d={total}
                fill="none"
                stroke="#784880"
                strokeWidth="3"
                pathLength="1"
                className="crm-line crm-animated"
              />
              <path
                d={curve(data.map((d, i) => ({ x: x(i), y: y(d.open) })))}
                fill="none"
                stroke="#0b887b"
                strokeWidth="2.5"
                pathLength="1"
                className="crm-line crm-animated"
              />
            </g>
            {data.map((d, i) => (
              <g key={d.date}>
                {(i === 0 ||
                  i === period - 1 ||
                  (i % (period === 14 ? 3 : 2) === 0 && i < period - 2)) && (
                  <text x={x(i)} y="233" textAnchor="middle">
                    {dateLabel(d.date)}
                  </text>
                )}
                <circle
                  cx={x(i)}
                  cy={y(d.total)}
                  r={point === i ? 6 : 3}
                  fill="#fff"
                  stroke="#784880"
                  strokeWidth="2"
                />
                <rect
                  x={x(i) - 16}
                  y="30"
                  width="32"
                  height="182"
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${dateLabel(d.date)}: ${d.total} created, ${d.open} currently open`}
                  onMouseEnter={() => setPoint(i)}
                  onMouseLeave={() => setPoint(null)}
                  onFocus={() => setPoint(i)}
                  onBlur={() => setPoint(null)}
                  className="crm-point"
                />
              </g>
            ))}
          </svg>
          <p className="crm-chart-hint">
            Hover or focus a date to inspect the record counts.
          </p>
        </div>
        <ChartData
          headers={["Created date", "Records", "Currently open"]}
          rows={data.map((d) => [dateLabel(d.date), d.total, d.open])}
        />
      </ChartPanel>
      <ChartPanel className="crm-source-chart">
        <div className="sl-panel-head">
          <div>
            <h2>Where records begin</h2>
            <p>Acquisition sources across client workspaces.</p>
          </div>
        </div>
        <div className="crm-donut">
          {sourcePoint !== null && (
            <ChartTooltip>
              <strong>{sources[sourcePoint].source}</strong>
              <span>
                {sources[sourcePoint].count} records ·{" "}
                {Math.round(
                  (sources[sourcePoint].count / Math.max(1, records.length)) *
                    100,
                )}
                %
              </span>
            </ChartTooltip>
          )}
          <svg
            viewBox="0 0 240 240"
            role="group"
            aria-label="CRM acquisition source donut"
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
              const fraction = s.count / Math.max(1, records.length);
              const start = offset;
              offset += fraction;
              return s.count > 0 ? (
                <circle
                  key={`${s.source}-${s.count}`}
                  cx="120"
                  cy="120"
                  r="88"
                  stroke={s.color}
                  strokeWidth={sourcePoint === i ? 31 : 25}
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
                  role="img"
                  aria-label={`${s.source}: ${s.count} records`}
                  onMouseEnter={() => setSourcePoint(i)}
                  onMouseLeave={() => setSourcePoint(null)}
                  onFocus={() => setSourcePoint(i)}
                  onBlur={() => setSourcePoint(null)}
                />
              ) : null;
            })}
          </svg>
          <div className="crm-donut-center">
            <strong>
              {sourcePoint === null
                ? records.length
                : sources[sourcePoint].count}
            </strong>
            <span>
              {sourcePoint === null
                ? "active records"
                : sources[sourcePoint].source}
            </span>
          </div>
        </div>
        <div className="crm-source-legend">
          {sources.map((s, i) => (
            <button
              key={s.source}
              onMouseEnter={() => setSourcePoint(i)}
              onMouseLeave={() => setSourcePoint(null)}
              onFocus={() => setSourcePoint(i)}
              onBlur={() => setSourcePoint(null)}
              onClick={() => setSourcePoint(i)}
              aria-label={`${s.source}: ${s.count} records, ${Math.round((s.count / Math.max(1, records.length)) * 100)} percent`}
            >
              <Legend label={s.source} color={s.color} />
              <strong>
                {s.count}
                <small>
                  {Math.round((s.count / Math.max(1, records.length)) * 100)}%
                </small>
              </strong>
            </button>
          ))}
        </div>
        <p className="crm-source-note">
          Archived records are excluded. Sources describe how records entered
          CRM.
        </p>
      </ChartPanel>
      <ChartPanel className="crm-stage-chart">
        <div className="sl-panel-head">
          <div>
            <h2>Open pipeline by stage</h2>
            <p>See where deals collect, then inspect the records.</p>
          </div>
          <span className="sl-badge">{openRecords.length} open</span>
        </div>
        <div className="crm-stage-bars">
          {CRM_STAGES.slice(0, 4).map((stage, i) => {
            const matches = openRecords.filter((r) => r.stage === stage);
            const share =
              (matches.length / Math.max(1, openRecords.length)) * 100;
            return (
              <button
                key={stage}
                className="crm-stage-row"
                onClick={() => onStage(stage)}
                onMouseEnter={() => setStagePoint(stage)}
                onMouseLeave={() => setStagePoint(null)}
                onFocus={() => setStagePoint(stage)}
                onBlur={() => setStagePoint(null)}
                aria-label={`Inspect ${stage}: ${matches.length} open records`}
              >
                {stagePoint === stage && (
                  <ChartTooltip>
                    <strong>{stage}</strong>
                    <span>
                      {matches.length} records · {Math.round(share)}%
                    </span>
                    <span>
                      {money(matches.reduce((sum, r) => sum + r.value, 0))}{" "}
                      estimated value
                    </span>
                  </ChartTooltip>
                )}
                <span className="crm-stage-label">
                  <strong>{stage}</strong>
                  <span>
                    {matches.length} records <ArrowUpRight size={13} />
                  </span>
                </span>
                <span className="crm-stage-track">
                  <span
                    key={`${stage}-${matches.length}`}
                    className="crm-animated"
                    style={{
                      width: `${share}%`,
                      background: ["#c5abd3", "#a788b7", "#9561a6", "#673c72"][
                        i
                      ],
                    }}
                  />
                </span>
                <small>
                  {money(matches.reduce((sum, r) => sum + r.value, 0))} ·{" "}
                  {Math.round(share)}% of open records
                </small>
              </button>
            );
          })}
        </div>
        <ChartData
          headers={["Stage", "Open records", "Estimated value"]}
          rows={CRM_STAGES.slice(0, 4).map((stage) => {
            const matches = openRecords.filter((r) => r.stage === stage);
            return [
              stage,
              matches.length,
              money(matches.reduce((sum, r) => sum + r.value, 0)),
            ];
          })}
        />
      </ChartPanel>
      <ChartPanel className="crm-value-chart">
        <div className="sl-panel-head">
          <div>
            <h2>Value by client</h2>
            <p>Estimated open pipeline beside closed-won value.</p>
          </div>
        </div>
        <div className="crm-legends">
          <Legend label="Open pipeline" color="#784880" />
          <Legend label="Closed won" color="#087b6e" />
        </div>
        <div className="crm-client-bars">
          {clients.map((c, i) => (
            <button
              key={c.id}
              onClick={() => onBusiness(c.id)}
              className="crm-client-bar"
              onMouseEnter={() => setClientPoint(c.id)}
              onMouseLeave={() => setClientPoint(null)}
              onFocus={() => setClientPoint(c.id)}
              onBlur={() => setClientPoint(null)}
              aria-label={`Inspect ${c.name}: ${money(c.open)} open, ${money(c.won)} won`}
            >
              {clientPoint === c.id && (
                <ChartTooltip>
                  <strong>{c.name}</strong>
                  <span>Open: {money(c.open)}</span>
                  <span>Won: {money(c.won)}</span>
                </ChartTooltip>
              )}
              <strong>{money(c.open, true)}</strong>
              <span className="crm-bar-pair">
                <span
                  key={`${c.id}-open-${c.open}`}
                  className="crm-value-bar crm-animated"
                  style={{
                    height: `${(c.open / valueMax) * 150}px`,
                    animationDelay: `${i * 60}ms`,
                  }}
                />
                <span
                  key={`${c.id}-won-${c.won}`}
                  className="crm-value-bar crm-won-bar crm-animated"
                  style={{
                    height: `${(c.won / valueMax) * 150}px`,
                    animationDelay: `${i * 60 + 40}ms`,
                  }}
                />
              </span>
              <span>
                {c.name}
                <ArrowUpRight size={12} />
              </span>
            </button>
          ))}
        </div>
        <p className="crm-value-note">
          All values are illustrative EUR amounts, not booked revenue.
        </p>
        <ChartData
          headers={["Client", "Open pipeline (EUR)", "Closed won (EUR)"]}
          rows={clients.map((c) => [c.name, c.open, c.won])}
        />
      </ChartPanel>
    </div>
  );
}
