"use client";

import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

export type ViewMode = "client" | "admin";

const VIEW_MODE_KEY = "sales_engine_view_mode";

/** Equivalent page in the other view, so switching keeps you on the same section. */
function counterpartPath(pathname: string, target: ViewMode): string {
  if (target === "admin") {
    if (pathname.startsWith("/smart-leads")) return "/admin/smart-leads";
    if (pathname.startsWith("/social-listening")) return "/admin/social-listening";
    if (pathname.startsWith("/crm")) return "/admin/crm";
    if (pathname.startsWith("/map")) return "/admin/map";
    return "/admin";
  }
  if (pathname.startsWith("/admin/smart-leads")) return "/smart-leads";
  if (pathname.startsWith("/admin/social-listening")) return "/social-listening";
  if (pathname.startsWith("/admin/crm")) return "/crm";
  if (pathname.startsWith("/admin/map")) return "/map";
  return "/sales-engine";
}

/**
 * Client ⇄ Admin switch shown in the profile dropdown of both navbars.
 * Uses a full page load so each view only carries its own stylesheets.
 */
export function ViewModeToggle({ mode }: { mode: ViewMode }) {
  const pathname = usePathname() ?? "/";
  const isAdmin = mode === "admin";

  const toggle = () => {
    const target: ViewMode = isAdmin ? "client" : "admin";
    try {
      localStorage.setItem(VIEW_MODE_KEY, target);
    } catch {
      /* storage unavailable — switching still works */
    }
    window.location.assign(counterpartPath(pathname, target));
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isAdmin}
      onClick={toggle}
      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/85 hover:bg-white/5 transition-colors cursor-pointer bg-transparent border-0"
    >
      <span className="flex items-center gap-3">
        <ShieldCheck size={15} className={isAdmin ? "text-[#2ae9c9]" : "text-white/60"} />
        <span className="flex flex-col items-start leading-tight">
          <span>Admin view</span>
          <span className="text-[10px] font-light text-white/50">{isAdmin ? "Switch back to client" : "Switch to platform admin"}</span>
        </span>
      </span>
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isAdmin ? "bg-[#2ae9c9]" : "bg-white/20"}`}
      >
        <span
          className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform ${isAdmin ? "translate-x-4.5" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}
