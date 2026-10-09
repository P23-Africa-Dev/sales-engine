"use client";

import Link from "next/link";
import FieldCommandHubHero from "@/components/landing/FieldCommandHubHero";

interface HeroSectionProps {
  onDownloadAgentApp: () => void;
}

export default function HeroSection({ onDownloadAgentApp }: HeroSectionProps) {
  return (
    <div className="flex-1 w-full flex flex-col lg:flex-row bg-white">
      {/* Main Content Pane (White Background - perfectly aligned 58% width matching Navbar) */}
      <div className="flex-grow lg:max-w-[58%] bg-white flex flex-col justify-between p-5 sm:p-10 lg:p-16 py-8 sm:py-10 lg:py-12 lg:min-h-[calc(100vh-100px)]">
        {/* Hero Content */}
        <main id="about" className="my-auto py-4 sm:py-6 lg:py-0 flex flex-col justify-center max-w-xl">
          {/* Feature Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white p-1 pr-3.5 sm:pr-4 self-start mb-6 sm:mb-8 shadow-sm max-w-full overflow-hidden">
            <span className="rounded-full bg-[#82C341] px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-[11px] font-bold text-white tracking-wide uppercase shrink-0">
              New
            </span>
            <span className="text-[11px] sm:text-[12px] font-medium text-[#4A5F64] tracking-wide truncate">
              Offline RealTime Tracking System
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl sm:text-5xl lg:text-[62px] font-extrabold text-[#0B252C] leading-[1.15] sm:leading-[1.1] tracking-[-0.02em] mb-6">
            The Ultimate Field <br className="hidden sm:inline" />
            Agent Tracking <br className="hidden sm:inline" />
            System
          </h1>

          {/* Subheading / Description */}
          <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed mb-8 sm:mb-10 max-w-lg">
            An all in one field management and CRM platform built for real world operations. Track teams, manage tasks, and capture customer interactions seamlessly, even offline.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3.5 sm:gap-4 w-full">
            <Link href="/register" className="w-full sm:w-auto">
              <button className="w-full sm:w-auto px-8 sm:px-10 h-13 sm:h-14 bg-[#0B252C] text-white text-sm font-bold rounded-full shadow-[0px_4px_12px_rgba(11,37,44,0.15)] hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer">
                Sign Up
              </button>
            </Link>
            <button
              onClick={onDownloadAgentApp}
              className="w-full sm:w-auto px-6 sm:px-8 h-13 sm:h-14 border-2 border-[#0B252C] text-[#0B252C] text-sm font-bold rounded-full bg-transparent hover:bg-[#0B252C]/5 active:scale-[0.98] transition-all cursor-pointer"
            >
              Download Agent App
            </button>
          </div>
        </main>
      </div>

      {/* Right Column Pane (Dark Teal Background - perfectly aligned 42% width matching Navbar) */}
      <div className="flex w-full lg:w-[42%] bg-[#0B252C] flex-col justify-center p-4 sm:p-8 lg:p-10 relative overflow-hidden min-h-[460px] sm:min-h-[540px] lg:min-h-[calc(100vh-100px)]">
        {/* Geometric Hexagon Background Accents */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-[#1E5A69]/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-[#82C341]/10 blur-3xl pointer-events-none" />

        {/* Command Hub Interactive Visual */}
        <div className="w-full flex-1 flex items-center justify-center z-10 py-4 lg:py-0">
          <FieldCommandHubHero />
        </div>
      </div>
    </div>
  );
}
