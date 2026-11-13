"use client";

import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import seed from "@/data/data.json";

import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import {
  createSavedLocation,
  deleteSavedLocation,
  listSavedLocations,
  updateSavedLocation,
  type ApiRoleBasePath,
  type CreateSavedLocationPayload,
  type ListSavedLocationsParams,
  type SavedLocation,
  type SavedLocationViewportBounds,
  type UpdateSavedLocationPayload,
} from "@/lib/api/saved-locations";
import { CRM_KEYS } from "@/hooks/use-crm";

export const SAVED_LOCATION_KEYS = {
  all: ["saved-locations"] as const,
  list: (companyId: number | string | undefined, params: ListSavedLocationsParams) =>
    ["saved-locations", "list", companyId, params] as const,
  infinite: (
    companyId: number | string | undefined,
    params: Omit<ListSavedLocationsParams, "page">,
  ) => ["saved-locations", "infinite", companyId, params] as const,
  viewport: (
    companyId: number | string | undefined,
    bounds: SavedLocationViewportBounds | null,
    mine?: boolean,
  ) => ["saved-locations", "viewport", companyId, bounds, mine ?? false] as const,
};

const MANAGEMENT_ROLES = ["owner", "admin", "supervisor"];
const DEFAULT_PAGE_SIZE = 50;
const VIEWPORT_PAGE_SIZE = 100;

function getSeedSavedLocations(): SavedLocation[] {
  return (
    (seed as unknown as { map?: { savedLocations?: SavedLocation[] } }).map
      ?.savedLocations ?? []
  );
}

function filterSeedLocations(
  items: SavedLocation[],
  params: {
    q?: string;
    type?: string;
    bounds?: SavedLocationViewportBounds | null;
  }
): SavedLocation[] {
  return items.filter((item) => {
    if (params.type && item.type !== params.type) return false;
    if (params.q) {
      const needle = params.q.toLowerCase();
      const matches =
        item.name.toLowerCase().includes(needle) ||
        (item.address ?? "").toLowerCase().includes(needle) ||
        (item.description ?? "").toLowerCase().includes(needle);
      if (!matches) return false;
    }
    if (params.bounds) {
      const { min_lat, max_lat, min_lng, max_lng } = params.bounds;
      if (
        item.latitude < min_lat ||
        item.latitude > max_lat ||
        item.longitude < min_lng ||
        item.longitude > max_lng
      ) {
        return false;
      }
    }
    return true;
  });
}

export type SavedLocationPermissions = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function useSavedLocationPermissions(): SavedLocationPermissions {
  const user = useAuthStore((s) => s.user);
  return useMemo(() => {
    const role = (getActiveCompanyContext(user).role ?? "owner").toLowerCase();
    const isManagement = MANAGEMENT_ROLES.includes(role);
    return {
      canCreate: isManagement || role === "agent",
      canEdit: isManagement || role === "agent",
      canDelete: role === "owner" || role === "admin",
    };
  }, [user]);
}

function useSavedLocationRequestContext(paramsCompanyId?: number | string) {
  const user = useAuthStore((s) => s.user);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const context = getActiveCompanyContext(user);
  const companyId = paramsCompanyId ?? context.apiCompanyId ?? 1;
  const basePath: ApiRoleBasePath =
    (context.role ?? "").toLowerCase() === "agent" ? "/agent" : "/admin";
  return { token, companyId, basePath };
}

/** Single-page list (legacy callers). Prefer infinite/viewport hooks for map UI. */
export function useSavedLocations(params: ListSavedLocationsParams = {}) {
  const { token, companyId, basePath } = useSavedLocationRequestContext(params.company_id);
  const queryParams: ListSavedLocationsParams = {
    ...params,
    company_id: companyId,
    per_page: params.per_page ?? DEFAULT_PAGE_SIZE,
  };

  return useQuery({
    queryKey: SAVED_LOCATION_KEYS.list(companyId, queryParams),
    queryFn: async (): Promise<SavedLocation[]> => {
      if (!hasActiveApiSession(token)) {
        return filterSeedLocations(getSeedSavedLocations(), {
          q: params.q,
          type: params.type,
        });
      }
      try {
        const res = await listSavedLocations(queryParams, token, basePath);
        return res.data.items;
      } catch {
        return filterSeedLocations(getSeedSavedLocations(), {
          q: params.q,
          type: params.type,
        });
      }
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 2,
  });
}

export type UseInfiniteSavedLocationsParams = {
  q?: string;
  type?: string;
  is_active?: boolean;
  mine?: boolean;
  near_lat?: number;
  near_lng?: number;
  per_page?: number;
  company_id?: number | string;
  enabled?: boolean;
};

export function useInfiniteSavedLocations(params: UseInfiniteSavedLocationsParams = {}) {
  const { token, companyId, basePath } = useSavedLocationRequestContext(params.company_id);
  const perPage = params.per_page ?? DEFAULT_PAGE_SIZE;
  const filterParams = {
    q: params.q?.trim() || undefined,
    type: params.type,
    is_active: params.is_active,
    mine: params.mine || undefined,
    near_lat: params.near_lat,
    near_lng: params.near_lng,
    per_page: perPage,
    company_id: companyId,
  };

  const query = useInfiniteQuery({
    queryKey: SAVED_LOCATION_KEYS.infinite(companyId, filterParams),
    queryFn: async ({ pageParam }) => {
      if (!hasActiveApiSession(token)) {
        const filtered = filterSeedLocations(getSeedSavedLocations(), {
          q: filterParams.q,
          type: filterParams.type,
        });
        return {
          items: filtered,
          pagination: {
            current_page: 1,
            per_page: perPage,
            total: filtered.length,
            last_page: 1,
          },
        };
      }
      try {
        const res = await listSavedLocations(
          { ...filterParams, page: pageParam },
          token,
          basePath,
        );
        return res.data;
      } catch {
        const filtered = filterSeedLocations(getSeedSavedLocations(), {
          q: filterParams.q,
          type: filterParams.type,
        });
        return {
          items: filtered,
          pagination: {
            current_page: 1,
            per_page: perPage,
            total: filtered.length,
            last_page: 1,
          },
        };
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const current = lastPage.pagination.current_page ?? 1;
      const last = lastPage.pagination.last_page ?? 1;
      return current < last ? current + 1 : undefined;
    },
    enabled: (params.enabled ?? true) && !!companyId,
    staleTime: 1000 * 30,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  const total = query.data?.pages[0]?.pagination.total ?? null;

  return {
    ...query,
    items,
    total,
  };
}

export function useSavedLocationsInViewport(
  bounds: SavedLocationViewportBounds | null,
  options?: { enabled?: boolean; company_id?: number | string; mine?: boolean },
) {
  const { token, companyId, basePath } = useSavedLocationRequestContext(options?.company_id);
  const mine = options?.mine ?? false;

  return useQuery({
    queryKey: SAVED_LOCATION_KEYS.viewport(companyId, bounds, mine),
    queryFn: async (): Promise<SavedLocation[]> => {
      if (!bounds) return [];
      if (!hasActiveApiSession(token)) {
        return filterSeedLocations(getSeedSavedLocations(), { bounds });
      }
      try {
        const res = await listSavedLocations(
          {
            company_id: companyId,
            per_page: VIEWPORT_PAGE_SIZE,
            page: 1,
            mine: mine || undefined,
            ...bounds,
          },
          token,
          basePath,
        );
        return res.data.items;
      } catch {
        return filterSeedLocations(getSeedSavedLocations(), { bounds });
      }
    },
    enabled: (options?.enabled ?? true) && !!bounds && !!companyId,
    staleTime: 1000 * 15,
  });
}

function useCompanyContextValues() {
  const user = useAuthStore((s) => s.user);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const context = getActiveCompanyContext(user);
  const basePath: ApiRoleBasePath =
    (context.role ?? "").toLowerCase() === "agent" ? "/agent" : "/admin";
  return { token, companyId: context.apiCompanyId ?? 1, basePath };
}

export function useCreateSavedLocation(options?: { onSuccess?: (location: SavedLocation) => void }) {
  const queryClient = useQueryClient();
  const { token, companyId, basePath } = useCompanyContextValues();

  return useMutation({
    mutationFn: (payload: Omit<CreateSavedLocationPayload, "company_id"> & { company_id?: number | string }) =>
      createSavedLocation(
        { ...payload, company_id: payload.company_id ?? (companyId as number | string) },
        token,
        basePath
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: SAVED_LOCATION_KEYS.all });
      if (res.data.location.linked_to_crm || res.data.location.crm_lead_id) {
        queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
      }
      options?.onSuccess?.(res.data.location);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to save location.");
    },
  });
}

export function useUpdateSavedLocation(options?: {
  onSuccess?: (location: SavedLocation) => void;
  onError?: (error: unknown) => void;
}) {
  const queryClient = useQueryClient();
  const { token, companyId, basePath } = useCompanyContextValues();

  return useMutation({
    mutationFn: ({
      locationId,
      payload,
    }: {
      locationId: number | string;
      payload: UpdateSavedLocationPayload;
    }) =>
      updateSavedLocation(
        locationId,
        { company_id: companyId as number | string, ...payload },
        token,
        basePath
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: SAVED_LOCATION_KEYS.all });
      if (res.data.location.linked_to_crm || res.data.location.crm_lead_id) {
        queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
      }
      options?.onSuccess?.(res.data.location);
    },
    onError: (err: unknown) => {
      if (options?.onError) {
        options.onError(err);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to update location.");
    },
  });
}

export function useDeleteSavedLocation(options?: { onSuccess?: (deletedId: number) => void }) {
  const queryClient = useQueryClient();
  const { token, companyId, basePath } = useCompanyContextValues();

  return useMutation({
    mutationFn: (locationId: number | string) =>
      deleteSavedLocation(locationId, { company_id: companyId as number | string }, token, basePath),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: SAVED_LOCATION_KEYS.all });
      queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
      options?.onSuccess?.(res.data.deleted_location_id);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete location.");
    },
  });
}
