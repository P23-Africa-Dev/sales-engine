"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronDown, LogOut, Settings, Users } from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/sales-engine", icon: "/dashboard-design/469fa.svg" },
  { name: "Smart Leads", href: "/sales-engine/smart-leads", icon: "/dashboard-design/8ea52.svg" },
  { name: "Social Listening", href: "/sales-engine/social-listening", icon: "/dashboard-design/d3b09.svg" },
  { name: "CRM", href: "/sales-engine/crm", icon: "/dashboard-design/f4304.svg" },
];

export function Navbar() {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => document.documentElement.style.setProperty("--admin-header-height", `${header.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={headerRef} className={cn("dashboard-header", isScrolled ? "is-scrolled" : "")}>
      <nav
        className="dashboard-navbar flex items-center justify-between text-white"
        aria-label="Main navigation"
      >
      {/* Logo */}
      <div className="flex items-center">
        <Link href="/sales-engine" className="flex items-center gap-2.5">
          <Image src="/dashboard-design/84470.svg" alt="SalesEngine Logo" width={26} height={26} />
          <span className="hidden text-base font-light sm:inline">
            Sales<i>Engine</i>
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="dashboard-navigation hidden lg:flex items-center">
          {navItems.map((item) => {
            const isActive =
              item.href === "/sales-engine"
                ? pathname === "/sales-engine" || pathname === "/"
                : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "dashboard-nav-link group relative flex items-center gap-2 transition-all cursor-pointer",
                  isActive ? "is-active" : ""
                )}
              >
                <Image
                  src={item.icon}
                  alt=""
                  width={item.name === "Dashboard" ? 21 : 24}
                  height={item.name === "Dashboard" ? 21 : 24}
                  className={cn(
                    "transition-opacity duration-300",
                    isActive ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                  )}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center gap-4 lg:gap-5">
        <button
          type="button"
          aria-label="Outreach activity"
          className="hidden sm:block cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-0 p-0"
        >
          <Image src="/dashboard-design/26ef3.svg" alt="Notifications" width={24} height={24} />
        </button>

        <div className="relative">
          <button 
            type="button"
            className="relative flex items-center gap-3 lg:gap-4 bg-transparent border-0 cursor-pointer text-left"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <div className="hidden sm:block">
              <p className="text-sm font-semibold tracking-tight text-white leading-tight">
                Kwame Smith
              </p>
              <p className="text-[11px] text-white/70 font-light leading-tight">
                username@gmail.com
              </p>
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-full overflow-hidden border-2 border-white/10 p-0.5 bg-white/10 flex items-center justify-center">
                <Image
                  src="/dashboard-design/e81cf.png"
                  alt="Kwame Smith"
                  width={44}
                  height={44}
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <ChevronDown className="text-white/70 w-4 h-4" />
            </div>
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-[#0f2a33] shadow-lg shadow-black/20 overflow-hidden z-50">
              {/* User Info Header */}
              <div className="p-4 border-b border-white/10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 p-0.5 bg-white/10 flex items-center justify-center shrink-0">
                  <Image
                    src="/dashboard-design/e81cf.png"
                    alt="Kwame Smith"
                    width={40}
                    height={40}
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Kwame Smith</p>
                  <p className="text-xs text-white/60">username@gmail.com</p>
                </div>
              </div>

              {/* Menu Items */}
              <div className="p-2">
                <Link
                  href="/sales-engine/settings"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors"
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>
                <Link
                  href="/sales-engine/account-management"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors"
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <Users className="w-4 h-4" />
                  Account Management
                </Link>
              </div>

              {/* Logout */}
              <div className="p-2 border-t border-white/10">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#ff6b6b] hover:bg-[#ff6b6b]/10 transition-colors bg-transparent border-0 cursor-pointer"
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
    <nav aria-label="Mobile navigation" className="flex lg:hidden gap-2 overflow-x-auto px-4 pb-3">
      {navItems.map(item => <Link key={item.name} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={cn("shrink-0 rounded-full px-3 py-2 text-xs", pathname === item.href ? "bg-[#2ae9c9] text-[#041014]" : "bg-white/5 text-white/70")}>{item.name}</Link>)}
    </nav>
  </header>
);
}
