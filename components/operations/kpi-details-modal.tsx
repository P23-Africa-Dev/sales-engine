"use client";

import React from 'react';
import { X, BarChart3 } from 'lucide-react';
import type { KpiItem } from '@/lib/api/kpi';

interface KpiDetailsModalProps {
  kpi: KpiItem | null;
  onClose: () => void;
  onEdit?: () => void;
}

export function KpiDetailsModal({ kpi, onClose, onEdit }: KpiDetailsModalProps) {
  if (!kpi) return null;

  const getPriorityStyle = (p?: string) => {
    switch (p?.toLowerCase()) {
      case 'high':
      case 'critical': return { bg: '#FEF2F2', text: '#DC2626', label: 'High Priority' };
      case 'medium': return { bg: '#FFFBEB', text: '#D97706', label: 'Medium Priority' };
      case 'low': return { bg: '#ECFDF5', text: '#059669', label: 'Low Priority' };
      default: return { bg: '#F3F4F6', text: '#4B5563', label: 'Normal Priority' };
    }
  };

  const currentPriority = getPriorityStyle(kpi.priority);
  const assigneeName = kpi.assignee?.name ?? 'Unassigned';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[94%] md:max-w-215 bg-white rounded-[28px] md:rounded-[40px] shadow-2xl overflow-hidden z-10 flex flex-col animate-in zoom-in-95 duration-300" style={{ maxHeight: '92vh' }}>
        <div className="relative w-full bg-[#eef0f3] overflow-hidden shrink-0 h-32 md:h-40 flex items-center justify-center">
          <BarChart3 size={48} className="text-gray-300" strokeWidth={1.5} />

          <div
            className="absolute top-3 right-3 px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-md z-20 border"
            style={{ backgroundColor: currentPriority.bg, color: currentPriority.text, borderColor: `${currentPriority.text}20` }}
          >
            {currentPriority.label}
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-9 h-9 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 transition-all shadow-md z-30"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-10 md:py-8 no-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12">
            <div className="space-y-6 md:space-y-7">
              <section>
                <h3 className="text-[14px] md:text-[15px] font-bold text-dash-dark mb-1.5">KPI Title</h3>
                <p className="text-[14px] text-gray-500 leading-snug">{kpi.name}</p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Category</h3>
                <p className="text-[14px] text-gray-500 capitalize underline decoration-gray-300 underline-offset-4 leading-relaxed mb-3">
                  {kpi.category.replace(/_/g, ' ')}
                </p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Target Value</h3>
                <p className="text-[14px] text-[#3A8C88] font-bold bg-[#7EB5AE]/10 border border-[#7EB5AE]/20 px-4 py-2 rounded-xl inline-block">
                  {kpi.target_value}
                </p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Timeline</h3>
                <p className="text-[14px] text-gray-400">
                  {kpi.start_date} — {kpi.end_date}
                </p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Assignee</h3>
                <p className="text-[14px] text-gray-400 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                    {assigneeName.charAt(0)}
                  </span>
                  {assigneeName}
                </p>
              </section>
            </div>

            <div className="flex flex-col">
              <section className="mb-6">
                <h3 className="text-[15px] font-bold text-dash-dark mb-2">Objective</h3>
                <div className="text-[13px] text-gray-500 leading-relaxed space-y-1">
                  <p>{kpi.objective}</p>
                </div>
              </section>

              <section className="mb-6">
                <h3 className="text-[15px] font-bold text-dash-dark mb-2">Expected Outcome</h3>
                <div className="text-[13px] text-gray-500 leading-relaxed space-y-1">
                  <p>{kpi.expected_outcome}</p>
                </div>
              </section>

              <div className="mt-auto pt-6 space-y-2">
                {onEdit && (
                  <button
                    onClick={onEdit}
                    className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-[#7EB5AE] text-white rounded-[20px] text-[15px] font-semibold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all"
                  >
                    Edit KPI
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-semibold hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
