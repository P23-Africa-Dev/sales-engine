export const OFFLINE_RECONNECT_PROBE_MS = 5000;

export type OfflineReconnectOptions = {
  reload?: () => void;
  probeUrl?: string;
  probeIntervalMs?: number;
  fetchFn?: typeof fetch;
  isOnline?: () => boolean;
};

export function createOfflineReconnectHandler(options: OfflineReconnectOptions = {}) {
  const reload = options.reload ?? (() => window.location.reload());
  const probeUrl = options.probeUrl ?? "/manifest.webmanifest";
  const probeIntervalMs = options.probeIntervalMs ?? OFFLINE_RECONNECT_PROBE_MS;
  const fetchFn = options.fetchFn ?? fetch;
  const isOnline = options.isOnline ?? (() => navigator.onLine);

  let probeTimer: ReturnType<typeof setInterval> | null = null;
  let isReconnecting = false;

  const handleOnline = () => {
    if (isReconnecting) return;
    isReconnecting = true;
    reload();
  };

  const probeConnectivity = async () => {
    if (isReconnecting) return;

    try {
      const response = await fetchFn(probeUrl, {
        method: "HEAD",
        cache: "no-store",
      });

      if (response.ok) {
        handleOnline();
      }
    } catch {
      // Stay on offline page until connectivity returns.
    }
  };

  const startListening = () => {
    if (typeof window === "undefined") return;

    window.addEventListener("online", handleOnline);

    if (!isOnline()) {
      probeTimer = setInterval(() => {
        void probeConnectivity();
      }, probeIntervalMs);
    }
  };

  const stopListening = () => {
    if (typeof window === "undefined") return;

    window.removeEventListener("online", handleOnline);

    if (probeTimer) {
      clearInterval(probeTimer);
      probeTimer = null;
    }
  };

  return {
    reload,
    startListening,
    stopListening,
    probeConnectivity,
  };
}
