"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Eye, ShieldCheck, XCircle } from "lucide-react";
import {
  isSupportSessionActiveInDocument,
  type SupportSessionDetails,
} from "@/lib/auth/support-session";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

type StatusEnvelope = {
  success: boolean;
  data: {
    support_session: SupportSessionDetails;
  } | null;
};

function remainingLabel(expiresAt: string, now: number): string {
  const remainingSeconds = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - now) / 1000),
  );
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SupportAccessBanner() {
  const [session, setSession] = useState<SupportSessionDetails | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!isSupportSessionActiveInDocument()) return;

    fetch("/api/support/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as StatusEnvelope;
        if (!response.ok || !payload.success || !payload.data?.support_session) {
          throw new Error("Support session unavailable");
        }
        setSession(payload.data.support_session);
      })
      .catch(() => {
        fetch("/api/support/end", { method: "POST" }).finally(() => {
          window.location.replace(getAuthTokenFromDocument() ? "/dashboard" : "/login");
        });
      });
  }, []);

  useEffect(() => {
    if (!session) return;

    document.documentElement.dataset.supportAccess = session.access_level;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      window.clearInterval(timer);
      delete document.documentElement.dataset.supportAccess;
    };
  }, [session]);

  const timeRemaining = useMemo(
    () => (session ? remainingLabel(session.expires_at, now) : ""),
    [now, session],
  );

  useEffect(() => {
    if (session && new Date(session.expires_at).getTime() <= now) {
      fetch("/api/support/end", { method: "POST" }).finally(() => {
        window.location.replace(getAuthTokenFromDocument() ? "/dashboard" : "/login");
      });
    }
  }, [now, session]);

  if (!session) return null;

  const endSession = async () => {
    setEnding(true);
    await fetch("/api/support/end", { method: "POST" }).catch(() => null);
    window.location.replace(getAuthTokenFromDocument() ? "/dashboard" : "/login");
  };

  const readOnly = session.access_level === "read_only";

  return (
    <div className="sticky top-0 z-[100] border-b border-amber-300 bg-amber-50 px-4 py-2 text-amber-950 shadow-sm">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200">
            {readOnly ? <Eye size={17} /> : <ShieldCheck size={17} />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              Support session as {session.target_user.name} · {session.company.name}
            </p>
            <p className="truncate text-xs text-amber-800">
              {readOnly ? "Read only" : "Operational full"} · {session.reason}
              {session.ticket_reference ? ` · ${session.ticket_reference}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <Clock3 size={14} />
            {timeRemaining}
          </span>
          <button
            type="button"
            onClick={endSession}
            disabled={ending}
            data-support-allowed
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            <XCircle size={14} />
            {ending ? "Ending…" : "End session"}
          </button>
        </div>
      </div>
    </div>
  );
}
