export function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildEntitySlug(id: string, label?: string): string {
  const cleanId = String(id).trim();
  const segment = label ? slugifySegment(label) : "";
  return segment ? `${segment}-${cleanId}` : cleanId;
}

export function resolveEntityIdentifier(slugOrId: string): string {
  const value = decodeURIComponent(String(slugOrId)).trim();
  if (!value) return "";

  const lastSegment = value.split("-").pop() ?? value;
  return /^\d+$/.test(lastSegment) ? lastSegment : value;
}

export function buildProjectSlug(projectId: string, projectName?: string): string {
  return buildEntitySlug(projectId, projectName);
}

export function resolveProjectIdentifier(projectSlugOrId: string): string {
  return resolveEntityIdentifier(projectSlugOrId);
}

export function buildTaskSlug(taskId: string, taskTitle?: string): string {
  return buildEntitySlug(taskId, taskTitle);
}

export function resolveTaskIdentifier(taskSlugOrId: string): string {
  return resolveEntityIdentifier(taskSlugOrId);
}
