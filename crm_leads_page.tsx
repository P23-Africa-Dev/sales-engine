"use client";

import {
  BookmarkPlus,
  ChevronDown,
  Eye,
  Import,
  Pencil,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Lead {
  id: string;
  name: string;
  company: string;
  status: string;
  statusColor: string;
  value: number;
  assignedTo: string;
  source: string;
}

const STATUSES = [
  { label: "Proposal sent", color: "#F59E0B" },
  { label: "Contacted", color: "#E879A0" },
  { label: "New Lead", color: "#2563EB" },
  { label: "Qualified", color: "#10B981" },
  { label: "Unqualified", color: "#1A1F2C" },
  { label: "Lost", color: "#EF4444" },
  { label: "Won", color: "#166534" },
];

const SOURCES = ["LinkedIn", "Twitter", "Referral", "Website", "Cold Call"];

const ALL_LEADS: Lead[] = Array.from({ length: 20 }, (_, i) => ({
  id: `lead-${i + 1}`,
  name: "Francis Nasyomba",
  company: "Raisin Capital Limited",
  status: "Proposal sent",
  statusColor: "#F59E0B",
  value: 40010,
  assignedTo: "Lane Wade",
  source: "LinkedIn",
}));

function StatusDropdown({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (s: string, c: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-[11px] font-semibold transition-opacity hover:opacity-85"
        style={{ backgroundColor: color }}
      >
        {value}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-[150px]">
          {STATUSES.map((s) => (
            <button
              key={s.label}
              onClick={() => {
                onChange(s.label, s.color);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[12px] text-[#0B1215] font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceDropdown({
  value,
  onChange,
  isSelected,
}: {
  value: string;
  onChange: (s: string) => void;
  isSelected: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-opacity hover:opacity-85 ${
          isSelected
            ? "bg-white/20 text-white border border-white/30"
            : "bg-[#E5E7EB] text-[#374151]"
        }`}
      >
        {value}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-[130px]">
          {SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className="w-full px-3 py-2 hover:bg-gray-50 text-left text-[12px] text-[#0B1215] font-medium transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AllLeadsPage({ basePath = "/crm" }: { basePath?: string }) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(ALL_LEADS);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allChecked = selected.size === leads.length;

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateStatus = (id: string, status: string, color: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status, statusColor: color } : l))
    );
  };

  const updateSource = (id: string, source: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, source } : l))
    );
  };

  const deleteLead = (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-350 mx-auto flex flex-col gap-5">
        {/* Top bar */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="relative w-full max-w-110 group">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search for Leads"
              className="w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              All Pipeline
              <ChevronDown size={13} />
            </button>
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <Tag size={13} />
              Label
            </button>
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <SlidersHorizontal size={13} />
              Filter
            </button>
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <Import size={13} />
              Import
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-[#0B1215] text-white rounded-[10px] text-[12px] font-medium hover:opacity-90 transition-all">
              Add New Leads
              <BookmarkPlus size={15} />
            </button>
          </div>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-[24px] shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] overflow-hidden flex flex-col h-[calc(100vh-200px)] min-h-96">
          {/* Select all + view toggle */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <div
                onClick={toggleAll}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                  allChecked
                    ? "bg-[#0B1215] border-[#0B1215]"
                    : "border-gray-300 group-hover:border-gray-400"
                }`}
              >
                {allChecked && (
                  <svg
                    width="10"
                    height="8"
                    viewBox="0 0 10 8"
                    fill="none"
                  >
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span className="text-[13px] font-medium text-gray-500">Select All</span>
            </label>

            <div className="flex items-center gap-1">
              <button
                onClick={() => router.push(basePath)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 transition-colors"
              >
                {/* Grid icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
                  <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
                  <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
                  <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
                </svg>
              </button>
              <button className="p-1.5 rounded-md bg-[#0B1215] text-white transition-colors">
                {/* List icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor" />
                  <rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor" />
                  <rect x="1" y="11" width="14" height="2" rx="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[40px_1fr_1.4fr_1.1fr_0.9fr_1fr_0.9fr_100px] gap-3 px-6 pb-4 shrink-0">
            <div />
            <div className="bg-[#3B82F6] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Leads
            </div>
            <div className="bg-[#D946EF] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Company
            </div>
            <div className="bg-[#F59E0B] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Status
            </div>
            <div className="bg-[#06B6D4] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Value
            </div>
            <div className="bg-[#8B5CF6] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Assigned to
            </div>
            <div className="bg-[#65A30D] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Source
            </div>
            <div className="text-[12px] font-semibold text-gray-500 px-4 py-2 text-center">
              Actions
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto px-4">
            {leads.map((lead) => {
              const isSelected = selected.has(lead.id);
              return (
                <div
                  key={lead.id}
                  onClick={() => router.push(`${basePath}/leads/${lead.id}`)}
                  className={`grid grid-cols-[40px_1fr_1.4fr_1.1fr_0.9fr_1fr_0.9fr_100px] gap-3 items-center px-2 py-3.5 rounded-2xl mb-1 transition-all duration-150 group/row cursor-pointer ${
                    isSelected
                      ? "bg-[#0B1215]"
                      : "hover:bg-gray-50 border border-transparent hover:border-gray-100"
                  }`}
                >
                  {/* Checkbox */}
                  <div className="flex items-center justify-center">
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleOne(lead.id); }}
                      className={`w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-white border-white"
                          : "border-gray-300"
                      }`}
                    >
                      {isSelected && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path
                            d="M1 3.5L3 5.5L8 1"
                            stroke="#0B1215"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Name */}
                  <span
                    className={`text-[13px] font-semibold truncate ${
                      isSelected ? "text-white" : "text-[#0B1215]"
                    }`}
                  >
                    {lead.name}
                  </span>

                  {/* Company */}
                  <span
                    className={`text-[12px] truncate ${
                      isSelected ? "text-white/80" : "text-gray-500"
                    }`}
                  >
                    {lead.company}
                  </span>

                  {/* Status */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <StatusDropdown
                      value={lead.status}
                      color={lead.statusColor}
                      onChange={(s, c) => updateStatus(lead.id, s, c)}
                    />
                  </div>

                  {/* Value */}
                  <span
                    className={`text-[13px] font-semibold ${
                      isSelected ? "text-white" : "text-[#0B1215]"
                    }`}
                  >
                    N {lead.value.toLocaleString()}
                  </span>

                  {/* Assigned to */}
                  <span
                    className={`text-[12px] truncate ${
                      isSelected ? "text-white/80" : "text-gray-500"
                    }`}
                  >
                    {lead.assignedTo}
                  </span>

                  {/* Source */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <SourceDropdown
                      value={lead.source}
                      onChange={(s) => updateSource(lead.id, s)}
                      isSelected={isSelected}
                    />
                  </div>

                  {/* Actions */}
                  <div
                    className={`flex items-center justify-center gap-2 ${
                      isSelected
                        ? "opacity-100"
                        : "opacity-0 group-hover/row:opacity-100"
                    } transition-opacity`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => router.push(`${basePath}/leads/${lead.id}`)}
                      className={`p-1 rounded-md transition-colors ${
                        isSelected ? "hover:bg-white/10" : "hover:bg-gray-100"
                      }`}
                    >
                      <Eye
                        size={14}
                        className={isSelected ? "text-white" : "text-gray-400"}
                      />
                    </button>
                    <button
                      onClick={() => router.push(`${basePath}/leads/${lead.id}`)}
                      className={`p-1 rounded-md transition-colors ${
                        isSelected ? "hover:bg-white/10" : "hover:bg-gray-100"
                      }`}
                    >
                      <Pencil
                        size={14}
                        className={isSelected ? "text-white" : "text-gray-400"}
                      />
                    </button>
                    <button
                      className={`p-1 rounded-md transition-colors ${
                        isSelected ? "hover:bg-white/10" : "hover:bg-gray-100"
                      }`}
                      onClick={() => deleteLead(lead.id)}
                    >
                      <Trash2
                        size={14}
                        className={isSelected ? "text-white" : "text-gray-400"}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-6 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[12px] text-gray-400">
              {selected.size > 0
                ? `${selected.size} of ${leads.length} selected`
                : `${leads.length} leads total`}
            </span>
            {selected.size > 0 && (
              <button
                onClick={() => {
                  selected.forEach((id) => deleteLead(id));
                  setSelected(new Set());
                }}
                className="flex items-center gap-1.5 text-[12px] font-medium text-red-500 hover:text-red-600 transition-colors"
              >
                <Trash2 size={13} />
                Delete selected
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
