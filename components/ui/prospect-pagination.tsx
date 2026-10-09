"use client";

import type { Dispatch, SetStateAction } from "react";

export const PAGE_SIZE = 4;

export function getPaginationPages(current: number, total: number) {
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

export function ProspectPagination({ page, totalItems, entityLabel, setPage, alwaysShow = false }: {
  alwaysShow?: boolean;
  page: number;
  totalItems: number;
  entityLabel: string;
  setPage: Dispatch<SetStateAction<number>>;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, totalItems);
  if (totalPages <= 1 && !alwaysShow) return null;

  return (
    <div role="navigation" aria-label="Prospect list pagination"
      className="prospect-pagination shrink-0 flex flex-wrap items-center justify-between gap-4 border-t border-[#e2e8f0] bg-white px-5 pt-4 text-[14px]">
      <span className="pagination-info font-normal text-[#587079]">
        Showing <strong className="font-semibold text-[#070b16]">{start}–{end}</strong> of <strong className="font-semibold text-[#070b16]">{totalItems}</strong> {entityLabel}
      </span>
      <div className="pagination-controls flex items-center gap-2">
        <button type="button" aria-label="Previous page" disabled={safePage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="pagination-nav-btn h-9 cursor-pointer rounded-full border border-[#294f5d] bg-[#022228] px-4 font-semibold text-white shadow-md disabled:cursor-not-allowed disabled:border-[#b4bfc2] disabled:bg-[#a5b1b5] disabled:shadow-none">‹ Prev</button>
        <div className="pagination-pages flex items-center gap-1">
          {getPaginationPages(safePage, totalPages).map((p, index) => typeof p === "number" ? (
            <button key={p} type="button" aria-label={`Page ${p}`} aria-current={p === safePage ? "page" : undefined}
              onClick={() => setPage(p)}
              className={`pagination-number-btn grid size-9 cursor-pointer place-items-center rounded-full font-semibold text-[#070b16] transition ${p === safePage ? "is-active bg-[#2ae9c9] shadow-md" : "bg-transparent hover:bg-gray-100"}`}>
              {p}
            </button>
          ) : <span key={`ellipsis-${index}`} aria-hidden="true" className="pagination-ellipsis px-1 text-[#789097]">…</span>)}
        </div>
        <button type="button" aria-label="Next page" disabled={safePage >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="pagination-nav-btn h-9 cursor-pointer rounded-full border border-[#294f5d] bg-[#022228] px-4 font-semibold text-white shadow-md disabled:cursor-not-allowed disabled:border-[#b4bfc2] disabled:bg-[#a5b1b5] disabled:shadow-none">Next ›</button>
      </div>
    </div>
  );
}
