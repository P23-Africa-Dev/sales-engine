'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { OpsTableRow, OpsTableNameCol, OpsTableCol, OpsTableStatus, OpsTableContainer } from './ops-table';
import type { AgentPresence } from '@/lib/agent-presence';
import { getAgentPresenceBadgeClass } from '@/lib/agent-presence';

export type AgentItem = {
  id: string;
  name: string;
  email: string;
  description: string;
  zone: string;
  zoneIds?: number[];
  phone: string;
  role: string;
  internalRole?: string;
  supervisorUserId?: number | null;
  status: string;
  time: string;
  avatar: string;
  isSuspended?: boolean;
  suspendedUntil?: string | null;
  /** @deprecated Use isMapActive for map-live styling */
  active: boolean;
  isMapActive: boolean;
  isSessionOnline: boolean;
  presence?: AgentPresence;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  // optional extras for pre-populating edit form
  avatarKey?: string;
  baseSalary?: number;
  salaryType?: "daily" | "weekly" | "monthly";
  salaryCurrency?: string;
};

const PAGE_SIZE = 4;

interface AgentListProps {
  agents: AgentItem[];
  selectedId?: string;
  onSelect?: (agent: AgentItem) => void;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
}

export function AgentList({
  agents,
  selectedId,
  onSelect,
  basePath,
  page: controlledPageProp,
  pageSize: pageSizeProp,
  totalPages: totalPagesProp,
  totalItems: totalItemsProp,
  onPageChange,
}: AgentListProps & { basePath: string }) {
  const [page, setPage] = useState(1);
  const isServerPaginated = typeof onPageChange === "function";
  const pageSize = isServerPaginated ? Math.max(1, pageSizeProp ?? PAGE_SIZE) : PAGE_SIZE;
  const controlledPage = isServerPaginated ? Math.max(1, controlledPageProp ?? 1) : page;
  const totalPages = isServerPaginated
    ? Math.max(1, totalPagesProp ?? 1)
    : Math.max(1, Math.ceil(agents.length / PAGE_SIZE));
  const totalItems = isServerPaginated ? (totalItemsProp ?? agents.length) : agents.length;
  const currentPage = Math.min(controlledPage, totalPages);
  const paginated = isServerPaginated
    ? agents
    : agents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handlePageChange = (nextPage: number) => {
    if (isServerPaginated && onPageChange) {
      onPageChange(nextPage);
      return;
    }

    setPage(nextPage);
  };

  return (
    <OpsTableContainer className="grow-0 flex flex-col h-140">
      {/* Header */}
      <div className="flex justify-end mb-5 shrink-0">
        <Link
          href={`${basePath}/operations/agents`}
          className="px-5 py-2 bg-dash-dark text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors"
        >
          View all Agents
        </Link>
      </div>

      {/* Scrollable rows */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-gray-400">
            No agents found.
          </div>
        ) : (
          <div className="space-y-3">
            {paginated.map((agent) => {
              const isSelected = selectedId === agent.id;
              return (
                <OpsTableRow
                  key={agent.id}
                  isSelected={isSelected}
                  onClick={() => onSelect?.(agent)}
                  avatar={agent.avatar}
                  avatarAlt={agent.name}
                >
                  <OpsTableNameCol name={agent.name} subText={agent.description} isSelected={isSelected} />
                  <OpsTableCol label="Zone" value={agent.zone} isSelected={isSelected} className="hidden sm:block w-28 sm:w-32" />
                  <OpsTableCol label="Phone Number" value={agent.phone} isSelected={isSelected} className="hidden md:block w-36 sm:w-40" />
                  <OpsTableCol label="Role" value={agent.role} isSelected={isSelected} className="hidden lg:block w-28 sm:w-32" />
                  <OpsTableStatus
                    label={agent.status}
                    subText={agent.time}
                    isSelected={isSelected}
                    badgeClass={getAgentPresenceBadgeClass(agent)}
                  />
                </OpsTableRow>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="shrink-0 flex items-center justify-between pt-5 mt-4 border-t border-gray-100">
        <p className="text-[12px] text-gray-400">
          {totalItems === 0
            ? "Showing 0 of 0"
            : `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min((currentPage - 1) * pageSize + paginated.length, totalItems)} of ${totalItems}`}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={15} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => handlePageChange(p)}
              className={`w-9 h-9 rounded-full text-[13px] font-bold transition-all ${p === currentPage ? 'bg-dash-dark text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </OpsTableContainer>
  );
}
