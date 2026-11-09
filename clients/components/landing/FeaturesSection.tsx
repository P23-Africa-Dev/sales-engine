"use client";

import { Map, MapPin, Route, Sparkles } from "lucide-react";

export default function FeaturesSection() {
  return (
    <section className="w-full bg-[#F9FBFC] py-16 sm:py-20 lg:py-28 px-4 sm:px-10 lg:px-24 font-sans mt-8 lg:mt-16">
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-16">

        {/* Section Header */}
        <div className="text-center max-w-2xl">
          <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-[#0B252C] leading-tight tracking-tight">
            The Ultimate Field Agent Tracking System
          </h2>
          <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed mt-4">
            Real time field operations management for Africa.
          </p>
        </div>

        {/* Top row — 3 feature cards */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Card 1 — See your team in real time */}
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0px_8px_30px_rgba(0,0,0,0.02)] hover:shadow-[0px_12px_40px_rgba(0,0,0,0.05)] hover:translate-y-[-2px] transition-all duration-300 p-6 sm:p-8 flex flex-col gap-5 sm:gap-6">
            <div className="w-14 h-14 rounded-full bg-[#2E72B6] flex items-center justify-center shrink-0 shadow-sm">
              <Map className="w-6 h-6 text-white" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0B252C] mb-3">See your team in real time</h3>
              <p className="text-sm text-[#4A5F64] leading-relaxed">
                Live GPS tracking across your entire field force. Know who is where, when they arrived, and how long they stayed. No check in calls. No guesswork.
              </p>
            </div>
          </div>

          {/* Card 2 — Own your territories */}
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0px_8px_30px_rgba(0,0,0,0.02)] hover:shadow-[0px_12px_40px_rgba(0,0,0,0.05)] hover:translate-y-[-2px] transition-all duration-300 p-6 sm:p-8 flex flex-col gap-5 sm:gap-6">
            <div className="w-14 h-14 rounded-full bg-[#A282BA] flex items-center justify-center shrink-0 shadow-sm">
              <MapPin className="w-6 h-6 text-white" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0B252C] mb-3">Own your territories</h3>
              <p className="text-sm text-[#4A5F64] leading-relaxed">
                Divide and assign areas so your team knows exactly where to work. Stop losing deals to overlap, gaps, or agents working the wrong zones.
              </p>
            </div>
          </div>

          {/* Card 3 — Track every lead and task */}
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0px_8px_30px_rgba(0,0,0,0.02)] hover:shadow-[0px_12px_40px_rgba(0,0,0,0.05)] hover:translate-y-[-2px] transition-all duration-300 p-6 sm:p-8 flex flex-col gap-5 sm:gap-6">
            <div className="w-14 h-14 rounded-full bg-[#7CB4A7] flex items-center justify-center shrink-0 shadow-sm">
              <Route className="w-6 h-6 text-white" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0B252C] mb-3">Track every lead and task</h3>
              <p className="text-sm text-[#4A5F64] leading-relaxed">
                CRM and project management in one place. Every follow up, assignment, and activity logged. Nothing falls through.
              </p>
            </div>
          </div>

        </div>

        {/* Bottom row — Automate your outreach + Stats Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
          
          {/* Card 4 — Automate your outreach */}
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0px_8px_30px_rgba(0,0,0,0.02)] hover:shadow-[0px_12px_40px_rgba(0,0,0,0.05)] hover:translate-y-[-2px] transition-all duration-300 p-6 sm:p-8 flex flex-col gap-5 sm:gap-6">
            <div className="w-14 h-14 rounded-full bg-[#B4A023] flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-6 h-6 text-white" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0B252C] mb-3">Automate your outreach</h3>
              <p className="text-sm text-[#4A5F64] leading-relaxed">
                AI powered sequences that run from your own connected inbox. The platform decides when and who to contact next.
              </p>
            </div>
          </div>

          {/* Stats area */}
          <div className="col-span-1 md:col-span-2 flex flex-col sm:flex-row items-center justify-around gap-8 pl-0 md:pl-8 py-6">
            
            {/* Stat 1 */}
            <div className="flex flex-col text-center sm:text-left">
              <span className="text-5xl lg:text-7xl font-extrabold text-[#0B252C] tracking-tight">25k +</span>
              <span className="text-base font-bold text-[#4A5F64] mt-2 tracking-wide">Total Users</span>
            </div>

            {/* Stat 2 */}
            <div className="flex flex-col text-center sm:text-left">
              <span className="text-5xl lg:text-7xl font-extrabold text-[#0B252C] tracking-tight">1.5k +</span>
              <span className="text-base font-bold text-[#4A5F64] mt-2 tracking-wide">Users Ratings</span>
            </div>

          </div>

        </div>

        {/* Bottom row — ELY AI highlight card */}
        <div className="w-full bg-gradient-to-br from-[#0B252C] via-[#113843] to-[#0A1F25] rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-10 border border-[#1E5A69]/30 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-8 mt-4">
          <div className="flex flex-col gap-3 max-w-xl">
            <div className="inline-flex items-center gap-2 bg-amber-400/10 border border-amber-300/30 text-amber-300 text-xs font-bold px-3 py-1 rounded-full self-start">
              <Sparkles className="w-3.5 h-3.5" />
              Powered by ELY Field AI
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold leading-tight">
              Intelligent route optimization & automated task dispatch
            </h3>
            <p className="text-sm text-white/80 leading-relaxed">
              ELY analyzes agent routes and daily schedules to cut transit times by up to 28% while boosting completed client visits per day.
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-center justify-center bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-6 text-center min-w-[200px]">
            <span className="text-4xl font-extrabold text-[#9BDD7C]">+35%</span>
            <span className="text-xs font-bold text-white/90 mt-1">Weekly Field Productivity</span>
          </div>
        </div>

      </div>
    </section>
  );
}
