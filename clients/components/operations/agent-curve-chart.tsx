'use client';

import { useState, useRef, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

const SORT_OPTIONS = ['Day', 'Week', 'Month'] as const;
type SortOption = typeof SORT_OPTIONS[number];

function SortDropdown() {
  const [selected, setSelected] = useState<SortOption>('Day');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-[13px] font-semibold text-dash-dark shadow-sm hover:bg-gray-50 transition-colors"
      >
        {selected}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 4l4 4 4-4" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-32 bg-white rounded-2xl shadow-lg border border-gray-100 py-1.5 z-20">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { setSelected(opt); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-[13px] font-medium transition-colors hover:bg-gray-50 ${
                selected === opt ? 'text-dash-teal font-semibold' : 'text-dash-dark'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const data = [
  { name: 'Apr 01', online: 45, offline: 30 },
  { name: 'Apr 02', online: 52, offline: 25 },
  { name: 'Apr 03', online: 48, offline: 35 },
  { name: 'Apr 04', online: 61, offline: 28 },
  { name: 'Apr 05', online: 55, offline: 32 },
  { name: 'Apr 06', online: 65, offline: 22 },
  { name: 'Apr 07', online: 58, offline: 38 },
  { name: 'Apr 08', online: 45, offline: 30 },
  { name: 'Apr 09', online: 52, offline: 25 },
];

export function AgentCurveChart() {
  return (
    <div className="w-full bg-white rounded-4xl px-6 pt-6 pb-2 shadow-sm">

      {/* Header — all one row */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-6 min-w-0 flex-wrap">
          <h3 className="text-[17px] font-bold text-dash-dark shrink-0">Agent Curve</h3>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-dash-teal shrink-0" />
              <span className="text-[12px] text-gray-400 font-medium">Online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF9F6A] shrink-0" />
              <span className="text-[12px] text-gray-400 font-medium">Offline</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-2 md:mt-0">
          <span className="text-[12px] text-gray-400">Sort by:</span>
          <SortDropdown />
        </div>
      </div>

      {/* Chart — explicit height so it's never hidden */}
      <div className="relative h-52">
        {/* Performance callout */}
        <div className="absolute left-[32%] top-0 z-10 bg-white shadow-lg rounded-2xl px-4 py-3 border border-gray-100 flex flex-col items-center pointer-events-none">
          <span className="text-[10px] text-gray-400 font-semibold">Agents Performance</span>
          <span className="text-[17px] font-black text-dash-teal leading-tight">-10%</span>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-b border-r border-gray-100 rotate-45" />
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#4FD1C5" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#4FD1C5" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorOffline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#FF9F6A" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#FF9F6A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="0" vertical={true} stroke="#F1F5F9" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94A3B8', fontSize: 12, fontWeight: 500 }}
              dy={12}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{ borderRadius: '14px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
            />
            <Area type="monotone" dataKey="online"  stroke="#4FD1C5" strokeWidth={3} fillOpacity={1} fill="url(#colorOnline)" />
            <Area type="monotone" dataKey="offline" stroke="#FF9F6A" strokeWidth={3} fillOpacity={1} fill="url(#colorOffline)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
