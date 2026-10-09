import type { PaginationData } from "@/lib/api/crm";

export function getLeadPageRange(
  pagination: PaginationData | undefined,
  itemCount: number,
): { from: number; to: number; total: number } {
  const currentPage = pagination?.current_page ?? 1;
  const perPage = pagination?.per_page ?? itemCount;
  const total = pagination?.total ?? itemCount;

  if (total === 0 || itemCount === 0) {
    return { from: 0, to: 0, total };
  }

  const from = (currentPage - 1) * perPage + 1;
  return { from, to: Math.min(from + itemCount - 1, total), total };
}

export function mergeLeadPages<T extends { id: number }>(pages: T[][]): T[] {
  const unique = new Map<number, T>();
  pages.forEach((page) => page.forEach((lead) => unique.set(lead.id, lead)));
  return Array.from(unique.values());
}
