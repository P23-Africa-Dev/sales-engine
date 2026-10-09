"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PaginationData } from "@/lib/api/crm";
import { getLeadPageRange } from "@/lib/crm/lead-visibility";

function visiblePages(currentPage: number, lastPage: number): number[] {
  const start = Math.max(1, Math.min(currentPage - 2, lastPage - 4));
  const end = Math.min(lastPage, Math.max(currentPage + 2, 5));
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export function LeadPagination({
  pagination,
  itemCount,
  page,
  onPageChange,
  disabled = false,
}: {
  pagination?: PaginationData;
  itemCount: number;
  page: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const currentPage = pagination?.current_page ?? page;
  const lastPage = pagination?.last_page ?? 1;
  const range = getLeadPageRange(pagination, itemCount);

  return (
    <div className="shrink-0 px-6 py-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <span className="text-[12px] text-gray-400">
        {range.total === 0
          ? "No leads found"
          : `Showing ${range.from.toLocaleString()}–${range.to.toLocaleString()} of ${range.total.toLocaleString()} leads`}
      </span>

      {lastPage > 1 && (
        <nav className="flex items-center gap-1" aria-label="Lead pages">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={disabled || currentPage <= 1}
            className="se-control h-8 w-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
          </button>
          {visiblePages(currentPage, lastPage).map((pageNumber) => (
            <button
              type="button"
              key={pageNumber}
              onClick={() => onPageChange(pageNumber)}
              disabled={disabled}
              className={`h-8 min-w-8 px-2 rounded-lg border text-[12px] font-semibold ${
                pageNumber === currentPage
                  ? "border-[#2ae9c9] bg-[#2ae9c9] text-[#022228]"
                  : "border-gray-200 text-gray-500"
              }`}
              aria-current={pageNumber === currentPage ? "page" : undefined}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(lastPage, currentPage + 1))}
            disabled={disabled || currentPage >= lastPage}
            className="se-control h-8 w-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight size={15} />
          </button>
        </nav>
      )}
    </div>
  );
}
