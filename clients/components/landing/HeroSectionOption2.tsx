"use client";

import Link from "next/link";
import HeroIllustration from "@/components/layout/HeroIllustration";

interface HeroSectionOption2Props {
  onDownloadAgentApp: () => void;
}

export default function HeroSectionOption2({ onDownloadAgentApp }: HeroSectionOption2Props) {
  return (
    <div className="relative w-full flex flex-col items-center justify-center pt-6 sm:pt-8 pb-[16px] sm:pb-[20px] lg:pb-[24px] px-3.5 sm:px-6 lg:px-8 z-20 overflow-x-clip">
      {/* Stepped Background Shape with Drop Shadow */}
      <div className="absolute inset-0 -z-10 filter drop-shadow-[0_25px_25px_rgba(0,0,0,0.15)] pointer-events-none">
        {/* Mobile View Background */}
        <div className="w-full h-full bg-[#0B252C] rounded-b-[22px] sm:hidden" />

        {/* Tablet/Desktop Left wing */}
        <div className="hidden sm:block absolute left-0 top-0 bottom-[var(--container-pb)] right-[calc(50%+var(--map-half-width)-1px)] bg-[#0B252C]" />

        {/* Tablet/Desktop Center body (protrusion with 26px rounded corners on bottom edges) */}
        <div className="hidden sm:block absolute left-[calc(50%-var(--map-half-width)-16px)] right-[calc(50%-var(--map-half-width)-16px)] top-0 bottom-0 bg-[#0B252C] rounded-b-[26px]" />

        {/* Tablet/Desktop Right wing */}
        <div className="hidden sm:block absolute left-[calc(50%+var(--map-half-width)-1px)] top-0 bottom-[var(--container-pb)] right-0 bg-[#0B252C]" />
      </div>

      {/* Background Ambient Glow Accents */}
      <div className="absolute top-0 right-0 -mr-24 -mt-24 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] rounded-full bg-[#1E5A69]/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-[300px] sm:w-[450px] h-[300px] sm:h-[450px] rounded-full bg-[#82C341]/10 blur-3xl pointer-events-none" />

      {/* Main Centered Hero Content */}
      <div className="relative z-10 max-w-5xl w-full mx-auto flex flex-col items-center text-center">
        {/* Top Feature Pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 backdrop-blur-md p-1 pr-3.5 sm:pr-4 mb-5 sm:mb-6 shadow-sm max-w-full overflow-hidden">
          <span className="rounded-full bg-[#82C341] px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-[11px] font-bold text-white tracking-wide uppercase shrink-0">
            New
          </span>
          <span className="text-[11px] sm:text-[12px] font-semibold text-white/90 tracking-wide truncate">
            Offline RealTime Tracking System
          </span>
        </div>

        {/* BOLD Centered Heading with Supervisor Tag */}
        <h1 className="text-[28px] xs:text-3xl sm:text-5xl lg:text-[56px] font-extrabold text-white leading-[1.18] sm:leading-[1.15] tracking-tight max-w-4xl mb-5 sm:mb-6 px-1">
          Your{" "}
          <span className="relative z-20 inline-flex items-center mr-[16px] sm:mr-[20px] lg:mr-[24px] select-none">
            {/* Green highlight pill wrapping field team */}
            <span className="inline-flex items-center bg-[#82C341]/10 border border-[#82C341]/30 text-[#9BDD7C] px-2.5 sm:px-4 py-0.5 sm:py-1 rounded-xl sm:rounded-2xl">
              field team
            </span>
            {/* Absolute supervisor flag positioned beside the pill */}
            <span className="absolute left-full top-1/2 -translate-y-[75%] w-[50px] sm:w-[60px] lg:w-[74px] block z-50">
              <img
                src="/supervisor-flag.png"
                alt="Supervisor"
                className="w-full h-auto block object-contain drop-shadow-sm select-none pointer-events-none"
              />
            </span>
          </span>is out there.
          <br />
          Do you know what they&rsquo;re doing?
        </h1>

        {/* Subtitle / Description */}
        <p className="text-xs sm:text-[16px] font-light text-white/80 text-center leading-relaxed sm:leading-normal max-w-[760px] mx-auto mb-7 sm:mb-8 px-2">
          Field teams across Africa run on guesswork, where agents are, who they&rsquo;re calling, whose territory is whose, what&rsquo;s actually been followed up. Every blind spot costs revenue. <span className="whitespace-nowrap">Factory 23</span> closes them.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4 w-full max-w-lg mb-8 sm:mb-12">
          <Link href="/register" className="w-full sm:w-auto">
            <button className="w-full sm:w-[180px] h-13 bg-white text-[#0B252C] text-sm font-extrabold rounded-full shadow-lg hover:bg-white/95 active:scale-[0.98] transition-all cursor-pointer">
              Sign Up
            </button>
          </Link>
          <button
            onClick={onDownloadAgentApp}
            className="w-full sm:w-[220px] h-13 border border-white/40 text-white text-sm font-extrabold rounded-full bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer"
          >
            Download Agent App
          </button>
        </div>

        {/* MAP VIEW CONTAINER WITH TOP-RIGHT DOODLE SVG ILLUSTRATION */}
        <div className="relative w-full max-w-[724px] mx-auto">
          {/* Hand-drawn SVG Doodle Illustration on Top Right of Map */}
          <HeroIllustration
            className="absolute z-30 pointer-events-none hidden lg:block"
            style={{
              width: "219px",
              height: "130px",
              transform: "rotate(-35.4deg)",
              transformOrigin: "top left",
              opacity: 1,
              top: "25px",
              left: "calc(100% - 63.5px)"
            }}
          />

          {/* Map Video Card */}
          <div className="relative w-full h-[208px] xs:h-[256px] sm:h-[368px] lg:h-[478px] rounded-xl sm:rounded-[26px] overflow-hidden shadow-2xl z-10 bg-[#0B252C] rounded-[19px] mt-6">
            <video
              src="/assets/GIFs/fac23landingpageHero.mp4"
              autoPlay
              loop
              muted
              playsInline
              disablePictureInPicture
              disableRemotePlayback
              className="w-full h-full object-cover rounded-xl sm:rounded-[26px] pointer-events-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
