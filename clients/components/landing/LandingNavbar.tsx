"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, User, LayoutGrid } from "lucide-react";
import FactoryLogo from "@/components/layout/FactoryLogo";

interface LandingNavbarProps {
  variant?: "default" | "dark";
  heroOption?: "option1" | "option2";
  onToggleHeroOption?: () => void;
  leftWidthClass?: string;
  rightWidthClass?: string;
  showP23AfricaOnRight?: boolean;
  minimal?: boolean;
}

export default function LandingNavbar({
  variant = "default",
  heroOption = "option1",
  onToggleHeroOption,
  leftWidthClass = "lg:max-w-[58%]",
  rightWidthClass = "lg:w-[42%]",
  showP23AfricaOnRight = false,
  minimal = false,
}: LandingNavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isDark = variant === "dark";

  useEffect(() => {
    const handleWindowScroll = () => {
      if (window.scrollY > 20) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener("scroll", handleWindowScroll);
    return () => window.removeEventListener("scroll", handleWindowScroll);
  }, []);

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    setIsOpen(false);
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      window.history.pushState(null, "", `#${targetId}`);
    }
  };

  return (
    <header
      className={`sticky top-0 w-full z-50 transition-all duration-300 ${
        scrolled ? "shadow-xl border-b border-black/5" : "shadow-none"
      }`}
    >
      {/* Desktop Split or Dark Navbar (lg screens and above) */}
      <div className="hidden lg:flex w-full items-stretch">
        {/* Left Pane Header */}
        <div
          className={`flex-1 ${leftWidthClass} px-6 sm:px-10 lg:px-16 pt-8 pb-6 flex items-center justify-between transition-colors duration-300 ${
            isDark ? "bg-[#0B252C]" : "bg-white"
          }`}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <FactoryLogo className="w-12 h-auto" />
            <span
              className={`text-lg sm:text-xl font-bold tracking-tight ${
                isDark ? "text-white" : "text-[#0B252C]"
              }`}
            >
              Factory 23
            </span>
          </Link>

          {/* Navigation Links */}
          {!minimal && (
            <nav className="flex items-center gap-8 sm:gap-10 xl:gap-14">
              <a
                href="#about"
                onClick={(e) => handleScroll(e, "about")}
                className={`text-sm font-semibold hover:opacity-80 transition-opacity ${
                  isDark ? "text-white/90" : "text-[#0B252C]"
                }`}
              >
                About
              </a>
              <a
                href="#pricing"
                onClick={(e) => handleScroll(e, "pricing")}
                className={`text-sm font-semibold hover:opacity-80 transition-opacity ${
                  isDark ? "text-white/90" : "text-[#0B252C]"
                }`}
              >
                Pricing
              </a>
              <a
                href="#reviews"
                onClick={(e) => handleScroll(e, "reviews")}
                className={`text-sm font-semibold hover:opacity-80 transition-opacity ${
                  isDark ? "text-white/90" : "text-[#0B252C]"
                }`}
              >
                Reviews
              </a>
              {/* {!showP23AfricaOnRight && (
                <a
                  href="https://p23africa.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-sm font-semibold hover:opacity-80 transition-opacity ${
                    isDark ? "text-white/90" : "text-[#0B252C]"
                  }`}
                >
                  P23 Africa
                </a>
              )} */}
            </nav>
          )}
        </div>

        {/* Right Pane Header (Dark Teal Background) */}
        <div className={`${rightWidthClass} bg-[#0B252C] px-6 sm:px-10 lg:px-16 pt-8 pb-6 flex items-center justify-end gap-3`}>
          {!minimal && showP23AfricaOnRight && (
            <a
              href="https://p23africa.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-white/90 hover:opacity-80 transition-opacity mr-auto"
            >
              P23 Africa
            </a>
          )}
          {/* Hero Toggle Switch Icon Button beside Login */}
          {/* {onToggleHeroOption && (
            <button
              onClick={onToggleHeroOption}
              title={`Switch Hero Layout (Current: ${
                heroOption === "option1" ? "Option 1 - Split View" : "Option 2 - Full Dark Green View"
              })`}
              className="px-3.5 h-11 border border-white/40 text-white text-xs font-bold rounded-full flex items-center gap-2 hover:border-white/70 hover:bg-white/10 active:scale-95 transition-all cursor-pointer bg-white/5 shadow-sm"
              aria-label="Toggle Hero Layout Option"
            >
              <LayoutGrid className="w-4 h-4 text-[#82C341]" />
              <span className="font-extrabold text-[11px] text-white">
                {heroOption === "option1" ? "Opt 1" : "Opt 2"}
              </span>
            </button>
          )} */}

          <Link
            href="/login"
            className="px-6 h-11 border border-white/40 text-white text-xs font-semibold rounded-full flex items-center justify-center gap-2 hover:border-white/70 hover:bg-white/10 active:scale-[0.98] transition-all"
          >
            <User className="w-4 h-4 stroke-[2.5]" />
            Log In
          </Link>
          <Link href="/register">
            <button className="px-6 h-11 bg-white text-[#0B252C] text-xs font-bold rounded-full shadow-[0px_2px_8px_rgba(0,0,0,0.1)] hover:bg-white/95 active:scale-[0.98] transition-all cursor-pointer">
              Book a Demo
            </button>
          </Link>
        </div>
      </div>

      {/* Mobile Navbar (< lg screens) */}
      <div
        className={`lg:hidden flex items-center justify-between w-full px-6 py-5 transition-colors duration-300 ${
          isDark ? "bg-[#0B252C] text-white" : "bg-white text-[#0B252C]"
        }`}
      >
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <FactoryLogo className="w-10 h-auto" />
          <span
            className={`text-lg font-bold tracking-tight ${
              isDark ? "text-white" : "text-[#0B252C]"
            }`}
          >
            Factory 23
          </span>
        </Link>

        {/* Mobile Action Controls */}
        <div className="flex items-center gap-2">
          {onToggleHeroOption && (
            <button
              onClick={onToggleHeroOption}
              className="p-2 border border-white/30 text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Toggle Hero Option"
            >
              <LayoutGrid className="w-5 h-5 text-[#82C341]" />
            </button>
          )}

          {/* Mobile Hamburger Button */}
          {!minimal && (
            <button
              onClick={() => setIsOpen(!isOpen)}
              className={`p-2 focus:outline-none rounded-lg transition-colors ${
                isDark ? "text-white hover:bg-white/10" : "text-[#0B252C] hover:bg-gray-100"
              }`}
              aria-label="Toggle navigation menu"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isOpen && !minimal && (
        <div
          className={`absolute top-full left-0 right-0 shadow-xl p-6 flex flex-col gap-5 z-40 animate-in fade-in slide-in-from-top-5 duration-200 lg:hidden ${
            isDark ? "bg-[#0B252C] border-t border-white/10 text-white" : "bg-white border-t border-gray-100 text-[#0B252C]"
          }`}
        >
          <a
            href="#about"
            onClick={(e) => handleScroll(e, "about")}
            className="text-base font-semibold py-2 border-b border-white/10 hover:text-opacity-70"
          >
            About
          </a>
          <a
            href="#pricing"
            onClick={(e) => handleScroll(e, "pricing")}
            className="text-base font-semibold py-2 border-b border-white/10 hover:text-opacity-70"
          >
            Pricing
          </a>
          <a
            href="#reviews"
            onClick={(e) => handleScroll(e, "reviews")}
            className="text-base font-semibold py-2 border-b border-white/10 hover:text-opacity-70"
          >
            Reviews
          </a>
          <a
            href="https://p23africa.com/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setIsOpen(false)}
            className="text-base font-semibold py-2 border-b border-white/10 hover:text-opacity-70"
          >
            P23 Africa
          </a>

          {/* Mobile Quick Action Buttons */}
          <div className="flex flex-col gap-3 mt-2">
            <Link
              href="/login"
              onClick={() => setIsOpen(false)}
              className="w-full h-12 border border-white/30 text-white text-sm font-semibold rounded-full flex items-center justify-center gap-2 hover:bg-white/10 transition-all"
            >
              <User className="w-4 h-4 stroke-[2.5]" />
              Log In
            </Link>
            <Link
              href="/register"
              onClick={() => setIsOpen(false)}
              className="w-full"
            >
              <button className="w-full h-12 bg-white text-[#0B252C] text-sm font-bold rounded-full shadow-md hover:opacity-90 transition-all cursor-pointer">
                Book a Demo
              </button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
