"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useConnectivityStatus } from "@/lib/offline/connectivity";
import { getOfflineSnapshot, type OfflineSnapshot } from "@/lib/offline/queue";
import {
  getRuntimeSyncStatus,
  subscribeRuntimeSyncStatus,
} from "@/lib/offline/sync-engine";

const EMPTY_SNAPSHOT: OfflineSnapshot = {
  pendingActions: 0,
  pendingUploads: 0,
  failedActions: 0,
  pendingConflicts: 0,
};

export default function OfflineStatusBanner() {
  const { isOffline, isClientReady } = useConnectivityStatus();
  const [snapshot, setSnapshot] = useState<OfflineSnapshot>(EMPTY_SNAPSHOT);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsSyncing(getRuntimeSyncStatus().isSyncing);
    let isSubscribed = true;

    const refresh = async () => {
      const next = await getOfflineSnapshot();
      if (isSubscribed) setSnapshot(next);
    };

    refresh();
    const interval = window.setInterval(refresh, 5000);
    const unsubscribe = subscribeRuntimeSyncStatus((status) => {
      if (isSubscribed) setIsSyncing(status.isSyncing);
    });

    return () => {
      isSubscribed = false;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const shouldShow = mounted && isClientReady && isOffline;
  if (!shouldShow) return null;

  const totalPending = snapshot.pendingActions + snapshot.pendingUploads;
  const title = "Offline mode active";

  return (
    <div className="group fixed bottom-6 left-6 z-[60]">
      <button
        type="button"
        onClick={() => setIsPanelOpen((prev) => !prev)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/40 bg-[#0B2330]/95 text-amber-200 shadow-2xl backdrop-blur transition hover:scale-[1.03]"
        aria-label={title}
        title={title}
      >
        <WifiOff size={18} />
        {totalPending > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-[#0B2330]">
            {totalPending > 99 ? "99+" : totalPending}
          </span>
        ) : null}
      </button>

      <div
        className={`absolute bottom-14 left-0 w-80 rounded-xl border border-white/15 bg-[#0B2330]/95 px-3 py-2 text-white shadow-2xl backdrop-blur ${
          isPanelOpen ? "block" : "hidden group-hover:block"
        }`}
      >
        <div className="text-xs font-semibold">{title}</div>
        <div className="mt-1 text-[11px] text-white/75">
          Actions: {snapshot.pendingActions} | Uploads: {snapshot.pendingUploads} | Failed:{" "}
          {snapshot.failedActions}
          {snapshot.pendingConflicts > 0 ? ` | Conflicts: ${snapshot.pendingConflicts}` : ""}
        </div>
        {isOffline ? (
          <div className="mt-1 text-[11px] text-amber-100/80">
            Changes are saved locally and will sync when you reconnect.
          </div>
        ) : null}
        {isSyncing ? (
          <div className="mt-1 text-[11px] text-[#75ADAF]">Synchronizing queued changes…</div>
        ) : null}
        {snapshot.pendingActions === 0 &&
        snapshot.pendingUploads === 0 &&
        snapshot.failedActions === 0 &&
        snapshot.pendingConflicts === 0 ? (
          <div className="mt-1 text-[11px] text-white/60">No queued changes yet.</div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/sync/queue"
            className="inline-block text-[11px] font-semibold text-[#75ADAF] underline"
          >
            View sync queue
          </Link>
          {snapshot.pendingConflicts > 0 ? (
            <Link
              href="/sync/conflicts"
              className="inline-block text-[11px] font-semibold text-[#75ADAF] underline"
            >
              Resolve conflicts
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
