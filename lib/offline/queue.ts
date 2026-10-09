"use client";

import {
  getOfflineDb,
  type HttpMutationMethod,
  type OfflineHttpMutationEntry,
} from "./db";

const SUPPORTED_MUTATION_RULES: Array<{
  method: HttpMutationMethod;
  pattern: RegExp;
}> = [
  { method: "POST", pattern: /^\/tasks$/ },
  { method: "PATCH", pattern: /^\/tasks\/[^/]+$/ },
  { method: "POST", pattern: /^\/agent\/tasks\/self$/ },
  { method: "PATCH", pattern: /^\/tasks\/[^/]+\/status$/ },
  { method: "PATCH", pattern: /^\/admin\/tasks\/[^/]+\/status$/ },
  { method: "POST", pattern: /^\/agent\/tasks\/[^/]+\/complete$/ },
  { method: "POST", pattern: /^\/projects$/ },
  { method: "PATCH", pattern: /^\/projects\/[^/]+$/ },
  { method: "POST", pattern: /^\/meetings$/ },
  { method: "PATCH", pattern: /^\/meetings\/[^/]+$/ },
  { method: "POST", pattern: /^\/meetings\/[^/]+\/cancel$/ },
  { method: "POST", pattern: /^\/agent\/attendance\/clock-in$/ },
  { method: "POST", pattern: /^\/agent\/attendance\/clock-out$/ },
];

const RETRY_BACKOFF_MS = [0, 30_000, 120_000, 300_000, 900_000] as const;

type AuthContext = {
  userId: string;
  companyId: string;
};

type PersistedAuthState = {
  state?: {
    user?: {
      id?: number | string;
      active_company?: {
        id?: number | string;
      } | null;
    } | null;
  };
};

function parseAuthContext(body?: unknown): AuthContext | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem("factory_auth_user");
    const parsed = raw ? (JSON.parse(raw) as PersistedAuthState) : null;
    const user = parsed?.state?.user;
    const userId = user?.id != null ? String(user.id) : null;

    const bodyCompany =
      body && typeof body === "object" && "company_id" in body
        ? (body as { company_id?: number | string }).company_id
        : null;

    const companyId =
      bodyCompany != null
        ? String(bodyCompany)
        : user?.active_company?.id != null
          ? String(user.active_company.id)
          : null;

    if (!userId || !companyId) return null;
    return { userId, companyId };
  } catch {
    return null;
  }
}

function nextAttemptAtFor(attempts: number): string {
  const delay = RETRY_BACKOFF_MS[Math.min(attempts, RETRY_BACKOFF_MS.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}

export function isOfflineQueueSupportedPath(
  method: string,
  path: string,
): method is HttpMutationMethod {
  const normalizedMethod = method.toUpperCase() as HttpMutationMethod;
  return SUPPORTED_MUTATION_RULES.some(
    (rule) => rule.method === normalizedMethod && rule.pattern.test(path),
  );
}

export async function enqueueOfflineHttpMutation(params: {
  method: HttpMutationMethod;
  path: string;
  body?: unknown;
}): Promise<number> {
  const context = parseAuthContext(params.body);
  if (!context) {
    throw new Error("Unable to determine offline queue context.");
  }

  const now = new Date().toISOString();
  const db = await getOfflineDb();
  const id = await db.add("httpMutationQueue", {
    method: params.method,
    path: params.path,
    bodyJson: JSON.stringify(params.body ?? {}),
    companyId: context.companyId,
    userId: context.userId,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  });

  await requestBackgroundSync("dashboard-offline-sync");
  return id;
}

export type OfflineSnapshot = {
  pendingActions: number;
  pendingUploads: number;
  failedActions: number;
  pendingConflicts: number;
};

export async function getOfflineSnapshot(): Promise<OfflineSnapshot> {
  const context = parseAuthContext();
  if (!context) {
    return {
      pendingActions: 0,
      pendingUploads: 0,
      failedActions: 0,
      pendingConflicts: 0,
    };
  }

  const db = await getOfflineDb();
  const [pendingActions, failedActions, pendingUploads, conflicts] = await Promise.all([
    db.getAllFromIndex("httpMutationQueue", "by-company-user-status", [
      context.companyId,
      context.userId,
      "pending",
    ]),
    db.getAllFromIndex("httpMutationQueue", "by-company-user-status", [
      context.companyId,
      context.userId,
      "failed",
    ]),
    db.getAllFromIndex("uploadQueue", "by-company-user-status", [
      context.companyId,
      context.userId,
      "pending",
    ]),
    db.getAllFromIndex("syncConflicts", "by-company-user-resolution", [
      context.companyId,
      context.userId,
      "pending",
    ]),
  ]);

  return {
    pendingActions: pendingActions.length,
    pendingUploads: pendingUploads.length,
    failedActions: failedActions.length,
    pendingConflicts: conflicts.length,
  };
}

export async function getRunnableMutations() {
  const context = parseAuthContext();
  if (!context) return [];

  const db = await getOfflineDb();
  const [pending, failed] = await Promise.all([
    db.getAllFromIndex("httpMutationQueue", "by-company-user-status", [
      context.companyId,
      context.userId,
      "pending",
    ]),
    db.getAllFromIndex("httpMutationQueue", "by-company-user-status", [
      context.companyId,
      context.userId,
      "failed",
    ]),
  ]);

  const now = Date.now();
  return [...pending, ...failed]
    .filter((entry) => {
      if (!entry.nextAttemptAt) return true;
      return new Date(entry.nextAttemptAt).getTime() <= now;
    })
    .sort((a, b) => {
      if (a.createdAt === b.createdAt) return (a.id ?? 0) - (b.id ?? 0);
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export async function markMutationSyncing(id: number): Promise<void> {
  const db = await getOfflineDb();
  const row = await db.get("httpMutationQueue", id);
  if (!row) return;
  await db.put("httpMutationQueue", {
    ...row,
    status: "syncing",
    updatedAt: new Date().toISOString(),
  });
}

export async function markMutationSynced(id: number): Promise<void> {
  const db = await getOfflineDb();
  const row = await db.get("httpMutationQueue", id);
  if (!row) return;
  await db.put("httpMutationQueue", {
    ...row,
    status: "synced",
    lastError: null,
    nextAttemptAt: null,
    updatedAt: new Date().toISOString(),
  });
}

export async function markMutationRetry(
  id: number,
  previousAttempts: number,
  status: "pending" | "failed",
  lastError: string | null,
): Promise<void> {
  const db = await getOfflineDb();
  const row = await db.get("httpMutationQueue", id);
  if (!row) return;
  const attempts = previousAttempts + 1;
  await db.put("httpMutationQueue", {
    ...row,
    attempts,
    status,
    nextAttemptAt: nextAttemptAtFor(attempts),
    lastError,
    updatedAt: new Date().toISOString(),
  });
}

export async function recordConflict(params: {
  mutationId: number;
  method: HttpMutationMethod;
  path: string;
  localPayloadJson: string;
  serverPayloadJson?: string | null;
  message: string;
}): Promise<void> {
  const context = parseAuthContext();
  if (!context) return;

  const db = await getOfflineDb();
  await db.add("syncConflicts", {
    mutationId: params.mutationId,
    companyId: context.companyId,
    userId: context.userId,
    method: params.method,
    path: params.path,
    localPayloadJson: params.localPayloadJson,
    serverPayloadJson: params.serverPayloadJson ?? null,
    message: params.message,
    resolution: "pending",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  });
}

export async function listPendingConflicts() {
  const context = parseAuthContext();
  if (!context) return [];

  const db = await getOfflineDb();
  return db.getAllFromIndex("syncConflicts", "by-company-user-resolution", [
    context.companyId,
    context.userId,
    "pending",
  ]);
}

export async function resolveConflict(
  conflictId: number,
  resolution: "keep_local" | "keep_server" | "merged",
): Promise<void> {
  const db = await getOfflineDb();
  const conflict = await db.get("syncConflicts", conflictId);
  if (!conflict) return;

  const mutation = await db.get("httpMutationQueue", conflict.mutationId);
  const now = new Date().toISOString();

  if (mutation) {
    if (resolution === "keep_server") {
      await db.put("httpMutationQueue", {
        ...mutation,
        status: "synced",
        nextAttemptAt: null,
        lastError: "Conflict resolved by keeping server version.",
        updatedAt: now,
      });
    } else {
      await db.put("httpMutationQueue", {
        ...mutation,
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        lastError:
          resolution === "merged"
            ? "Conflict marked as merged; mutation pending replay."
            : "Conflict resolved by keeping local version.",
        updatedAt: now,
      });
    }
  }

  await db.put("syncConflicts", {
    ...conflict,
    resolution,
    resolvedAt: now,
  });
}

export async function requestBackgroundSync(tag: string): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (syncTag: string) => Promise<void> };
    };
    if (registration.sync) {
      await registration.sync.register(tag);
    }
  } catch {
    // Background sync is best-effort.
  }
}

export type QueueListItem = OfflineHttpMutationEntry & { id: number };

export async function listHttpMutationQueue(): Promise<QueueListItem[]> {
  const context = parseAuthContext();
  if (!context) return [];

  const db = await getOfflineDb();
  const statuses = ["pending", "syncing", "failed", "synced"] as const;
  const rows = await Promise.all(
    statuses.map((status) =>
      db.getAllFromIndex("httpMutationQueue", "by-company-user-status", [
        context.companyId,
        context.userId,
        status,
      ]),
    ),
  );

  return rows
    .flat()
    .filter((entry): entry is QueueListItem => entry.id != null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function retryHttpMutation(id: number): Promise<void> {
  const db = await getOfflineDb();
  const row = await db.get("httpMutationQueue", id);
  if (!row) return;

  const now = new Date().toISOString();
  await db.put("httpMutationQueue", {
    ...row,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    updatedAt: now,
  });

  await requestBackgroundSync("dashboard-offline-sync");
}

export function describeHttpMutation(entry: QueueListItem): string {
  const path = entry.path;
  if (entry.method === "POST" && path === "/tasks") return "Create task";
  if (entry.method === "PATCH" && /^\/tasks\/[^/]+$/.test(path)) return "Edit task";
  if (entry.method === "PATCH" && path.endsWith("/status")) return "Update task status";
  if (entry.method === "POST" && path.includes("/complete")) return "Complete task";
  if (entry.method === "POST" && path === "/projects") return "Create project";
  if (entry.method === "PATCH" && path.startsWith("/projects/")) return "Edit project";
  if (entry.method === "POST" && path === "/meetings") return "Schedule meeting";
  if (entry.method === "PATCH" && path.startsWith("/meetings/")) return "Edit meeting";
  if (entry.method === "POST" && path.endsWith("/cancel")) return "Cancel meeting";
  if (path.includes("clock-in")) return "Clock in";
  if (path.includes("clock-out")) return "Clock out";
  return `${entry.method} ${path}`;
}

