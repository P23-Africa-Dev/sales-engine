const MANAGEMENT_MAP_ROLES = ["owner", "admin", "management", "manager", "supervisor"];

export type TaskMapNavigationInput = {
  id: string | number;
  latitude?: number | null;
  longitude?: number | null;
  label?: string;
  location?: string;
  address?: string;
};

export type TaskMapFocus = {
  taskId: number;
  lat: number;
  lng: number;
  title?: string;
  address?: string;
};

export function getMapBasePathForRole(role?: string | null): string {
  return MANAGEMENT_MAP_ROLES.includes(role ?? "") ? "/map" : "/agent/map";
}

/**
 * Builds a map URL that focuses on the task's destination coordinates.
 * Returns null when the task has no usable coordinates.
 */
export function buildTaskMapUrl(
  task: TaskMapNavigationInput,
  role?: string | null,
): string | null {
  const lat = task.latitude;
  const lng = task.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const base = getMapBasePathForRole(role);
  const params = new URLSearchParams({
    taskId: String(task.id),
    lat: String(lat),
    lng: String(lng),
  });

  const title = (task.location || task.label || "").trim();
  if (title) params.set("title", title);
  if (task.address?.trim()) params.set("address", task.address.trim());

  return `${base}?${params.toString()}`;
}

/**
 * Parses task-focus params from a map page URL.
 * Returns null unless taskId, lat and lng are all present and valid.
 */
export function parseTaskMapParams(searchParams: URLSearchParams): TaskMapFocus | null {
  const taskId = Number.parseInt(searchParams.get("taskId") ?? "", 10);
  const lat = Number.parseFloat(searchParams.get("lat") ?? "");
  const lng = Number.parseFloat(searchParams.get("lng") ?? "");

  if (!Number.isFinite(taskId) || taskId <= 0) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const title = searchParams.get("title")?.trim() || undefined;
  const address = searchParams.get("address")?.trim() || undefined;

  return { taskId, lat, lng, title, address };
}
