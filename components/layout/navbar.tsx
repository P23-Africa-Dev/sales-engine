"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { clearAuthSession, getAuthTokenFromDocument } from "@/lib/auth/session";
import { logoutFromSalesEngine } from "@/lib/api/sales-engine-native-auth";
import { getSalesEngineToken, clearSalesEngineSession } from "@/lib/sales-engine/session";
import { ChevronDown, Menu, X, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/sample";
import LogoutModal from "@/components/ui/logout-modal";
import { resolveAvatarSrc } from "@/lib/avatar";


const navItems = [
  { name: "Dashboard", href: "/sales-engine", icon: "/dashboard-design/469fa.svg" },
  { name: "Smart Leads", href: "/smart-leads", icon: "/dashboard-design/8ea52.svg" },
  { name: "Social Listening", href: "/social-listening", icon: "/dashboard-design/d3b09.svg" },
  { name: "CRM", href: "/crm", icon: "/dashboard-design/f4304.svg" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const clearUser = useAuthStore((s) => s.clearUser);
  const basePath = "";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    try {
      const token = getSalesEngineToken() ?? getAuthTokenFromDocument();
      if (token) {
        await logoutFromSalesEngine(token);
      }
    } catch {
      // Continue local logout cleanup even if API logout fails.
    }

    clearAuthSession();
    clearSalesEngineSession();
    clearUser();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    } else {
      router.push("/login");
    }
  }

  return (
    <nav className="dashboard-navbar flex items-center justify-between text-white relative z-50">
      {/* Logo */}
      <div className="flex items-center">
        <Link href="/sales-engine" className="flex items-center gap-2.5">
          <Image src="/dashboard-design/84470.svg" alt="" width={26} height={26} />
          <span className="hidden text-base font-light sm:inline">Sales<i>Engine</i></span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="dashboard-navigation hidden lg:flex items-center">
          {navItems.map((item) => {
            const itemHref = basePath + item.href;
            const isActive = item.href === "/sales-engine" ? pathname.startsWith("/sales-engine") : pathname.startsWith(itemHref);
            return (
              <Link
                key={item.name}
                href={itemHref}
                className={cn(
                  "dashboard-nav-link group relative flex items-center gap-2 transition-all",
                  isActive ? "is-active" : "",
                )}
              >
                <Image
                  src={item.icon}
                  alt=""
                  width={item.name === "Dashboard" ? 21 : 24}
                  height={item.name === "Dashboard" ? 21 : 24}
                  className={cn(
                    "transition-opacity duration-300",
                    isActive
                      ? "opacity-100"
                      : "opacity-60 group-hover:opacity-100",
                  )}
                />
                <span>{item.name}</span>
                {/* {item.hasDropdown && (
                  <ChevronDown size={14} className="opacity-40" />
                )} */}

              </Link>
            );
          })}
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center gap-4 lg:gap-5">
        <Link href="/sales-engine/outreach" aria-label="Outreach activity" className="hidden sm:block"><Image src="/dashboard-design/26ef3.svg" alt="" width={24} height={24} /></Link>
        <Link href="/smart-leads?settings=outreach" aria-label="Outreach settings" className="hidden sm:block"><Image src="/dashboard-design/934c3.svg" alt="" width={24} height={24} /></Link>
        <div
          ref={profileRef}
          className="relative flex items-center gap-3 lg:gap-4"
        >
          <div className="hidden xl:block text-left">
            <p className="text-sm font-bold tracking-tight">
              {user?.name ?? "—"}
            </p>
            <p className="text-[10px] text-white/80 font-light">
              {user?.email ?? "—"}
            </p>
          </div>

          {/* Avatar + chevron trigger */}
          <button
            aria-label="Profile menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-1.5 focus:outline-none group"
          >
            <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-full overflow-hidden border-2 border-white/10 p-0.5 bg-white/10 flex items-center justify-center">
              {(() => {
                const avatarSrc = resolveAvatarSrc(user?.avatar);
                return (
                  <Image
                    src={avatarSrc}
                    alt="Profile"
                    width={44}
                    height={44}
                    className="w-full h-full object-cover rounded-full"
                    unoptimized={avatarSrc.startsWith("http")}
                  />
                );
              })()}
            </div>
            <ChevronDown
              size={14}
              className={cn(
                "text-white/40 group-hover:text-white/70 transition-all duration-200",
                profileOpen && "rotate-180 text-white/70",
              )}
            />
          </button>

          {/* Dropdown */}
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 top-full mt-3 w-56 bg-[#0d2d3a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
              >
                {/* Profile header */}
                <div className="px-4 py-3.5 border-b border-white/10 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                    {(() => {
                      const avatarSrc = resolveAvatarSrc(user?.avatar);
                      return (
                        <Image
                          src={avatarSrc}
                          alt="Profile"
                          width={36}
                          height={36}
                          className="w-full h-full object-cover rounded-full"
                          unoptimized={avatarSrc.startsWith("http")}
                        />
                      );
                    })()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {user?.name ?? "—"}
                    </p>
                    <p className="text-[11px] text-white/40 truncate">
                      {user?.email ?? "—"}
                    </p>
                  </div>
                </div>

                {/* Menu items */}
                <div className="p-1.5">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      setIsLogoutModalOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-sm font-medium cursor-pointer"
                  >
                    <LogOut size={15} />
                    Log out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden p-2 text-white/60 hover:text-white transition-colors"
          aria-label="Navigation menu"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99] lg:hidden"
            />

            {/* Content */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[80%] max-w-sm bg-[#09232D] border-l border-white/5 z-[100] lg:hidden p-8 flex flex-col gap-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-4">
                <Link
                  href="/sales-engine"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <Image src="/dashboard-design/84470.svg" alt="" width={26} height={26} />
                  <span className="text-base font-light text-white">Sales<i>Engine</i></span>
                </Link>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-white/40 hover:text-white"
                >
                  <X size={28} />
                </button>
              </div>

              <div className="space-y-1">
                {navItems.map((item) => {
                  const itemHref = basePath + item.href;
                  const isActive = item.href === "/sales-engine" ? pathname.startsWith("/sales-engine") : pathname.startsWith(itemHref);
                  return (
                    <Link
                      key={item.name}
                      href={itemHref}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-2xl transition-all",
                        isActive
                          ? "bg-white/5 text-white"
                          : "text-white/40 hover:bg-white/5",
                      )}
                    >
                      <Image
                        src={item.icon}
                        alt=""
                        width={item.name === "Dashboard" ? 21 : 24}
                        height={item.name === "Dashboard" ? 21 : 24}
                        className={isActive ? "opacity-100" : "opacity-40"}
                      />
                      <span className="text-lg font-bold">{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-auto space-y-6">
                <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full border border-white/20 bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                      {(() => {
                        const avatarSrc = resolveAvatarSrc(user?.avatar);
                        return (
                          <Image
                            src={avatarSrc}
                            alt="Profile"
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                            unoptimized={avatarSrc.startsWith("http")}
                          />
                        );
                      })()}
                    </div>
                    <div>
                      <p className="text-base font-bold">{user?.name ?? "—"}</p>
                      <p className="text-xs text-white/30">
                        {user?.email ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsLogoutModalOpen(true);
                  }}
                  className="w-full bg-red-500/10 p-4 rounded-xl flex items-center justify-center gap-3 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                >
                  <LogOut size={22} />
                  <span className="text-sm font-bold">Log out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Logout Confirmation Modal Overlay */}
      <LogoutModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleLogout}
      />

    </nav>
  );
}
