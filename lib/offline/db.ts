import { openDB, type IDBPDatabase } from "idb";

export type HttpMutationMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export interface OfflineHttpMutationEntry {
  id?: number;
  method: HttpMutationMethod;
  path: string;
  bodyJson: string;
  companyId: string;
  userId: string;
  status: "pending" | "syncing" | "failed" | "synced";
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineUploadEntry {
  id?: number;
  kind: "proof" | "attachment" | "signature";
  ownerMutationId: number | null;
  companyId: string;
  userId: string;
  fileBlob: Blob;
  fileName: string;
  mimeType: string;
  status: "pending" | "uploaded" | "failed";
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineConflictEntry {
  id?: number;
  mutationId: number;
  companyId: string;
  userId: string;
  method: HttpMutationMethod;
  path: string;
  localPayloadJson: string;
  serverPayloadJson: string | null;
  message: string;
  resolution: "pending" | "keep_local" | "keep_server" | "merged";
  createdAt: string;
  resolvedAt: string | null;
}

type OfflineDBSchema = {
  httpMutationQueue: {
    key: number;
    value: OfflineHttpMutationEntry;
    indexes: {
      "by-status": string;
      "by-company-user-status": [string, string, string];
      "by-createdAt": string;
      "by-nextAttemptAt": string;
    };
  };
  uploadQueue: {
    key: number;
    value: OfflineUploadEntry;
    indexes: {
      "by-status": string;
      "by-company-user-status": [string, string, string];
      "by-ownerMutationId": number;
      "by-nextAttemptAt": string;
    };
  };
  syncConflicts: {
    key: number;
    value: OfflineConflictEntry;
    indexes: {
      "by-resolution": string;
      "by-company-user-resolution": [string, string, string];
      "by-mutationId": number;
    };
  };
};

const DB_NAME = "factory-dashboard-offline";
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<OfflineDBSchema> | null = null;

export async function getOfflineDb(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("httpMutationQueue")) {
        const store = db.createObjectStore("httpMutationQueue", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by-status", "status");
        store.createIndex("by-company-user-status", ["companyId", "userId", "status"]);
        store.createIndex("by-createdAt", "createdAt");
        store.createIndex("by-nextAttemptAt", "nextAttemptAt");
      }

      if (!db.objectStoreNames.contains("uploadQueue")) {
        const store = db.createObjectStore("uploadQueue", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by-status", "status");
        store.createIndex("by-company-user-status", ["companyId", "userId", "status"]);
        store.createIndex("by-ownerMutationId", "ownerMutationId");
        store.createIndex("by-nextAttemptAt", "nextAttemptAt");
      }

      if (!db.objectStoreNames.contains("syncConflicts")) {
        const store = db.createObjectStore("syncConflicts", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by-resolution", "resolution");
        store.createIndex("by-company-user-resolution", [
          "companyId",
          "userId",
          "resolution",
        ]);
        store.createIndex("by-mutationId", "mutationId");
      }
    },
  });

  return dbInstance;
}

