"use client";

import Link from "next/link";
import { useState } from "react";
import FactoryLogo from "@/components/layout/FactoryLogo";

export default function Footer() {
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    // Newsletter subscription action placeholder
    setEmail("");
  };

  return (
    <footer className="w-full bg-[#9BDD7C] px-6 py-12 md:px-16 lg:px-24 text-[#0B252C] font-sans">
      <div className="max-w-7xl mx-auto flex flex-col gap-10">
        
        {/* Top Section */}
        <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-10 text-center md:text-left w-full">
          
          {/* Logo and Navigation Links */}
          <div className="flex flex-col items-center md:items-start gap-6">
            {/* Logo + Brand Name */}
            <div className="flex items-center justify-center md:justify-start gap-3">
              <FactoryLogo className="w-12 h-auto" />
              <span className="text-2xl font-bold tracking-tight">Factory 23</span>
            </div>
            
            {/* Nav Menu */}
            <nav className="flex flex-wrap justify-center md:justify-start gap-x-8 gap-y-2">
              <Link href="#" className="text-sm font-semibold hover:opacity-80 transition-opacity">
                About
              </Link>
              <Link href="#" className="text-sm font-semibold hover:opacity-80 transition-opacity">
                Pricing
              </Link>
              <Link href="#" className="text-sm font-semibold hover:opacity-80 transition-opacity">
                Reviews
              </Link>
              {/* <a
                href="https://p23africa.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold hover:opacity-80 transition-opacity"
              >
                P23 Africa
              </a> */}
            </nav>
          </div>

          {/* Newsletter Form */}
          <div className="flex flex-col items-center md:items-start gap-3 w-full md:w-auto min-w-[280px] sm:min-w-[300px] lg:min-w-[360px]">
            <span className="text-sm font-semibold">Get the freshest news from us</span>
            <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 w-full">
              <input
                type="email"
                placeholder="Your email address..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 px-4 py-3 bg-white text-[#0B252C] placeholder-[#0B252C]/50 rounded-lg text-sm focus:outline-none w-full"
              />
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-3 bg-[#0B252C] text-white text-sm font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
              >
                Subscribe
              </button>
            </form>
          </div>

        </div>

        {/* Divider line */}
        <div className="border-t border-[#0B252C]/15 w-full" />

        {/* Bottom Section */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-medium">
          <div className="flex gap-4">
            <Link href="/files/Factory23 Terms of Service.pdf" target="_blank" rel="noopener noreferrer" className="hover:underline">Terms &amp; Conditions</Link>
            <span>|</span>
            <Link href="/files/Factory23 Privacy Policy.pdf" target="_blank" rel="noopener noreferrer" className="hover:underline">Privacy Policy</Link>
          </div>
          <span>2026. All right reserved</span>
        </div>

      </div>
    </footer>
  );
}
