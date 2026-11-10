"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  CheckCircle2,
  Sparkles,
  Wifi,
  Navigation,
  Clock,
  UserCheck,
  TrendingUp,
  Layers,
  ChevronRight,
  ChevronLeft,
  Zap,
  Compass,
} from "lucide-react";

type TabType = "tracking" | "dispatch" | "ai";

// 5 Active Agents with 24-Second Staggered Master Choreography Timeline
// Keyframes kept strictly between top: 22% and top: 58% to prevent overlap with HUD bars
const agentRoutes = [
  {
    id: 0,
    name: "Sarah M.",
    role: "Senior Field Agent",
    status: "Navigating to Client",
    destination: "Apex Retail • Marina Exp",
    eta: "4 mins (1.2 km)",
    speed: "42 km/h",
    avatar: "/avatars/female-avatar.png",
    statusColor: "bg-emerald-400",
    pulseColor: "border-emerald-400/60",
    badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
    topAnim: ["22%", "34%", "48%", "56%", "56%", "48%", "34%", "22%"],
    leftAnim: ["15%", "28%", "36%", "26%", "26%", "36%", "28%", "15%"],
    times: [0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.85, 1.0],
  },
  {
    id: 1,
    name: "John D.",
    role: "Territory Sales Rep",
    status: "En Route to Hub",
    destination: "Ikeja Central • Victoria Ave",
    eta: "7 mins (2.4 km)",
    speed: "48 km/h",
    avatar: "/avatars/john_avatar.png",
    statusColor: "bg-amber-400",
    pulseColor: "border-amber-400/60",
    badgeBg: "bg-amber-500/20 text-amber-300 border-amber-400/30",
    topAnim: ["56%", "56%", "42%", "28%", "22%", "22%", "38%", "56%"],
    leftAnim: ["42%", "42%", "55%", "64%", "76%", "76%", "60%", "42%"],
    times: [0, 0.18, 0.32, 0.45, 0.6, 0.72, 0.86, 1.0],
  },
  {
    id: 2,
    name: "Donald N.",
    role: "Account Executive",
    status: "Visiting Client",
    destination: "Zenith Tower • Financial District",
    eta: "Arrived (On Visit)",
    speed: "0 km/h (Parked)",
    avatar: "/avatars/donald_avatar.png",
    statusColor: "bg-sky-400",
    pulseColor: "border-sky-400/60",
    badgeBg: "bg-sky-500/20 text-sky-300 border-sky-400/30",
    topAnim: ["22%", "22%", "34%", "48%", "58%", "58%", "42%", "22%"],
    leftAnim: ["75%", "75%", "64%", "72%", "80%", "80%", "70%", "75%"],
    times: [0, 0.35, 0.48, 0.62, 0.75, 0.85, 0.93, 1.0],
  },
  {
    id: 3,
    name: "Amara K.",
    role: "Logistics Coordinator",
    status: "Dispatched to Warehouse",
    destination: "Westland Supply Depot",
    eta: "11 mins (4.1 km)",
    speed: "52 km/h",
    avatar: "/avatars/female-avatar-old.png",
    statusColor: "bg-purple-400",
    pulseColor: "border-purple-400/60",
    badgeBg: "bg-purple-500/20 text-purple-300 border-purple-400/30",
    topAnim: ["58%", "58%", "44%", "30%", "24%", "24%", "42%", "58%"],
    leftAnim: ["18%", "18%", "24%", "18%", "32%", "32%", "22%", "18%"],
    times: [0, 0.48, 0.62, 0.75, 0.88, 0.94, 0.98, 1.0],
  },
  {
    id: 4,
    name: "Victor E.",
    role: "Field Operations Tech",
    status: "Site Inspection",
    destination: "Innovation Park • Tower 4",
    eta: "3 mins (0.8 km)",
    speed: "35 km/h",
    avatar: "/avatars/male-avatar.png",
    statusColor: "bg-rose-400",
    pulseColor: "border-rose-400/60",
    badgeBg: "bg-rose-500/20 text-rose-300 border-rose-400/30",
    topAnim: ["30%", "30%", "40%", "52%", "58%", "58%", "44%", "30%"],
    leftAnim: ["45%", "45%", "35%", "52%", "48%", "48%", "42%", "45%"],
    times: [0, 0.6, 0.74, 0.85, 0.92, 0.95, 0.98, 1.0],
  },
];

const dispatchTasks = [
  {
    title: "Store Audit & Inventory Check",
    client: "Apex Retail • Ikeja Mall",
    assignee: "Sarah M.",
    avatar: "/avatars/female-avatar.png",
    time: "10:30 AM",
    status: "In Progress",
    priority: "High",
    priorityBg: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  },
  {
    title: "Quarterly POS Setup & Verification",
    client: "Crest Holdings Ltd.",
    assignee: "John D.",
    avatar: "/avatars/john_avatar.png",
    time: "11:45 AM",
    status: "Dispatched",
    priority: "Medium",
    priorityBg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  {
    title: "Client Onboarding & Contract Signoff",
    client: "Zenith Financial Center",
    assignee: "Donald N.",
    avatar: "/avatars/donald_avatar.png",
    time: "02:15 PM",
    status: "Completed",
    priority: "Normal",
    priorityBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
];

export default function FieldCommandHubHero() {
  // Fixed default view on Live Tracking
  const [activeTab, setActiveTab] = useState<TabType>("tracking");
  const [selectedAgent, setSelectedAgent] = useState<number>(0);

  // Rotate selected agent info card smoothly every 4.8s to showcase all 5 agents
  useEffect(() => {
    const interval = setInterval(() => {
      setSelectedAgent((prev) => (prev + 1) % agentRoutes.length);
    }, 4800);
    return () => clearInterval(interval);
  }, []);

  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab);
  };

  const currentAgent = agentRoutes[selectedAgent];

  return (
    <div className="w-full max-w-lg lg:max-w-xl mx-auto flex flex-col gap-3 font-sans select-none">
      {/* Top Glassmorphic Navigation Bar */}
      <div className="flex items-center justify-between bg-white/10 backdrop-blur-xl border border-white/15 p-1.5 rounded-2xl shadow-xl">
        <button
          onClick={() => handleTabClick("tracking")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeTab === "tracking"
              ? "bg-gradient-to-r from-[#1E5A69] to-[#133139] text-white shadow-md border border-white/20"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="font-extrabold tracking-wide">Live GPS Map</span>
        </button>

        {/* <button
          onClick={() => handleTabClick("dispatch")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeTab === "dispatch"
              ? "bg-gradient-to-r from-[#1E5A69] to-[#133139] text-white shadow-md border border-white/20"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <Layers className="w-4 h-4 text-[#9BDD7C]" />
          <span>Task Dispatch</span>
        </button> */}

        {/* <button
          onClick={() => handleTabClick("ai")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeTab === "ai"
              ? "bg-gradient-to-r from-[#1E5A69] to-[#133139] text-white shadow-md border border-white/20"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>ELY AI Engine</span>
        </button> */}
      </div>

      {/* Main Glass Visual Viewport - Generous Height to prevent UI Squeeze */}
      <div className="relative w-full h-[460px] sm:h-[480px] min-h-[440px] bg-[#07191E] border border-white/20 rounded-3xl overflow-hidden shadow-2xl p-4 flex flex-col justify-between">
        {/* Background Radial & Subtle Grid */}
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#3B82F6_1.5px,transparent_1.5px)] [background-size:20px_20px]" />

        <AnimatePresence mode="wait">
          {/* TAB 1: GOOGLE MAPS STYLE LIVE TRACKING VIEWPORT WITH 5 AGENTS */}
          {activeTab === "tracking" && (
            <motion.div
              key="tracking"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative w-full h-full flex flex-col justify-between z-10"
            >
              {/* Google Maps Styled Vector Environment */}
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                <svg className="w-full h-full" viewBox="0 0 450 320" fill="none">
                  {/* Water Body (River / Bay Curve) */}
                  <path
                    d="M-20,280 C120,260 220,310 470,240 L470,330 L-20,330 Z"
                    fill="#051317"
                    opacity="0.8"
                  />

                  {/* Park / Green Zones */}
                  <path
                    d="M 40,20 C 90,10 140,40 120,90 C 80,120 20,80 40,20 Z"
                    fill="#0D2B24"
                    opacity="0.6"
                    stroke="#144237"
                    strokeWidth="1"
                  />
                  <path
                    d="M 280,140 C 340,130 390,160 370,210 C 320,230 260,190 280,140 Z"
                    fill="#0D2B24"
                    opacity="0.5"
                    stroke="#144237"
                    strokeWidth="1"
                  />

                  {/* Urban Road Networks (Google Dark Mode Road Theme) */}
                  <g stroke="#163A45" strokeWidth="6" strokeLinecap="round" opacity="0.6">
                    <line x1="0" y1="80" x2="450" y2="80" />
                    <line x1="0" y1="180" x2="450" y2="180" />
                    <line x1="120" y1="0" x2="120" y2="320" />
                    <line x1="320" y1="0" x2="320" y2="320" />
                    <path d="M 50,260 C 180,140 280,240 420,120" />
                  </g>

                  {/* Minor Street Grid Lines */}
                  <g stroke="#0E272E" strokeWidth="2.5" opacity="0.8">
                    <line x1="0" y1="40" x2="450" y2="40" />
                    <line x1="0" y1="130" x2="450" y2="130" />
                    <line x1="0" y1="230" x2="450" y2="230" />
                    <line x1="60" y1="0" x2="60" y2="320" />
                    <line x1="220" y1="0" x2="220" y2="320" />
                    <line x1="390" y1="0" x2="390" y2="320" />
                  </g>

                  {/* Street Names (Google Maps Typography) */}
                  <text x="130" y="75" fill="#4B7480" fontSize="8" fontWeight="800" letterSpacing="1">
                    MARINA EXPRESSWAY
                  </text>
                  <text x="325" y="140" fill="#4B7480" fontSize="8" fontWeight="800" letterSpacing="1">
                    IKEJA WAY
                  </text>
                  <text x="15" y="175" fill="#4B7480" fontSize="7" fontWeight="700">
                    VICTORIA AVE
                  </text>

                  {/* BOLD GOOGLE MAPS NAVIGATION BLUE ROUTES & CURVED PATHS */}
                  {/* Route 1: Sarah M. (Electric Blue Navigation Path) */}
                  <path
                    d="M 67,58 C 126,90 157,144 189,198"
                    stroke="#3B82F6"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                  />
                  <path
                    d="M 67,58 C 126,90 157,144 189,198"
                    stroke="#93C5FD"
                    strokeWidth="2"
                    strokeDasharray="8 8"
                    className="animate-dash-route"
                  />

                  {/* Route 2: John D. (Cyan Navigation Arc) */}
                  <path
                    d="M 189,192 C 247,192 279,102 351,70"
                    stroke="#06B6D4"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                  />
                  <path
                    d="M 189,192 C 247,192 279,102 351,70"
                    stroke="#A5F3FC"
                    strokeWidth="2"
                    strokeDasharray="8 8"
                    className="animate-dash-route"
                  />

                  {/* Route 3: Donald N. (Emerald Coastal Route) */}
                  <path
                    d="M 337,64 C 292,112 324,176 369,224"
                    stroke="#10B981"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  />

                  {/* Route 4: Amara K. (Purple Loop) */}
                  <path
                    d="M 81,230 C 108,176 81,128 144,96"
                    stroke="#A855F7"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray="6 6"
                    className="animate-dash-route"
                  />

                  {/* Destination Pins (Google Maps Style Teardrops) */}
                  <g transform="translate(189, 198)">
                    <circle cx="0" cy="0" r="7" fill="#EF4444" className="animate-pulse" />
                    <circle cx="0" cy="0" r="3" fill="#FFFFFF" />
                  </g>
                  <g transform="translate(351, 70)">
                    <circle cx="0" cy="0" r="7" fill="#F59E0B" className="animate-pulse" />
                    <circle cx="0" cy="0" r="3" fill="#FFFFFF" />
                  </g>
                  <g transform="translate(369, 224)">
                    <circle cx="0" cy="0" r="7" fill="#06B6D4" className="animate-pulse" />
                    <circle cx="0" cy="0" r="3" fill="#FFFFFF" />
                  </g>
                </svg>
              </div>

              {/* Top Google Maps Style Header HUD */}
              <div className="flex items-center justify-between relative z-20">
                <div className="inline-flex items-center gap-2 bg-[#091C22]/90 backdrop-blur-xl px-3 py-1.5 rounded-full border border-white/20 text-[11px] sm:text-xs text-white shadow-xl">
                  <Compass className="w-3.5 h-3.5 text-[#3B82F6] animate-spin" style={{ animationDuration: "10s" }} />
                  <span className="font-extrabold tracking-tight">Live Fleet Radar &bull; 5 Agents Active</span>
                </div>

                {/* Google Turn-by-Turn Pill */}
                <div className="inline-flex items-center gap-1.5 bg-[#3B82F6]/25 backdrop-blur-xl px-2.5 py-1 rounded-full border border-[#3B82F6]/40 text-[10px] sm:text-[11px] font-bold text-blue-200 shadow-xl">
                  <Navigation className="w-3 h-3 text-[#60A5FA]" />
                  <span className="hidden sm:inline">Turn Right onto Marina Exp</span>
                  <span className="sm:hidden">Marina Exp</span>
                </div>
              </div>

              {/* 5 BOLD AGENT PROFILES & MARKERS (Staggered 24s Master Choreography - Calibrated Bounds) */}
              <div className="relative flex-1 w-full my-1 z-20 pointer-events-auto">
                {agentRoutes.map((agent, i) => {
                  const isSelected = selectedAgent === i;
                  return (
                    <motion.button
                      key={agent.id}
                      onClick={() => setSelectedAgent(i)}
                      animate={{
                        top: agent.topAnim,
                        left: agent.leftAnim,
                      }}
                      transition={{
                        duration: 24,
                        times: agent.times,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer ${
                        isSelected ? "z-40 scale-110" : "z-30"
                      }`}
                    >
                      <div className="relative flex items-center justify-center">
                        {/* Bold Glowing Pulse Halo */}
                        <span
                          className={`absolute w-10 h-10 rounded-full border-2 ${agent.pulseColor} animate-ping opacity-75`}
                        />

                        {/* Profile Avatar Capsule */}
                        <div
                          className={`relative w-9 h-9 rounded-full overflow-hidden border-2 shadow-2xl transition-all group-hover:scale-115 ${
                            isSelected ? "border-white ring-2 ring-[#3B82F6]/60" : "border-white/90"
                          }`}
                        >
                          <Image
                            src={agent.avatar}
                            alt={agent.name}
                            width={36}
                            height={36}
                            className="object-cover w-full h-full"
                          />
                        </div>

                        {/* Status Indicator Dot */}
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0B252C] ${agent.statusColor}`}
                        />
                      </div>

                      {/* Label Pill above Avatar */}
                      <div className="absolute left-1/2 -translate-x-1/2 -top-6 bg-[#091B20]/90 backdrop-blur-md text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap shadow-xl border border-white/20 flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${agent.statusColor}`} />
                        {agent.name}
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Bottom Card: Google Maps Style Turn-by-Turn Live Agent HUD */}
              <div className="relative z-30 bg-[#08181D]/95 backdrop-blur-2xl border border-white/25 rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border-2 border-white/50 shadow-md">
                    <Image
                      src={currentAgent.avatar}
                      alt={currentAgent.name}
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs sm:text-sm font-extrabold text-white leading-tight truncate">
                        {currentAgent.name}
                      </h4>
                      <span
                        className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${currentAgent.badgeBg}`}
                      >
                        {currentAgent.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#3B82F6] font-bold flex items-center gap-1.5 mt-0.5 truncate">
                      <Navigation className="w-3.5 h-3.5 shrink-0 animate-pulse text-[#60A5FA]" />
                      <span>{currentAgent.status}</span>
                      <span className="text-white/60 font-normal hidden sm:inline">
                        ({currentAgent.destination})
                      </span>
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <div className="text-right hidden sm:block">
                    <span className="text-[10px] text-white/70 block font-semibold">
                      ETA &bull; {currentAgent.eta}
                    </span>
                    <span className="text-xs font-extrabold text-emerald-400">
                      Speed: {currentAgent.speed}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setSelectedAgent((prev) => (prev === 0 ? agentRoutes.length - 1 : prev - 1))
                      }
                      className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 transition text-white flex items-center justify-center cursor-pointer active:scale-95"
                      aria-label="Previous Agent"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        setSelectedAgent((prev) => (prev + 1) % agentRoutes.length)
                      }
                      className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 transition text-white flex items-center justify-center cursor-pointer active:scale-95"
                      aria-label="Next Agent"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: TASK DISPATCH BOARD */}
          {activeTab === "dispatch" && (
            <motion.div
              key="dispatch"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative w-full h-full flex flex-col justify-between z-10"
            >
              {/* Header Ticker */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white/90 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#9BDD7C]" />
                  Live Dispatch Queue (5 Active)
                </span>
                <span className="text-[11px] font-semibold text-[#9BDD7C] bg-[#9BDD7C]/10 px-2.5 py-1 rounded-full border border-[#9BDD7C]/20">
                  Auto-Dispatched by ELY
                </span>
              </div>

              {/* Task Cards List */}
              <div className="flex-1 flex flex-col gap-2.5 overflow-hidden justify-center">
                {dispatchTasks.map((task, idx) => (
                  <div
                    key={idx}
                    className="bg-white/10 hover:bg-white/15 transition-all backdrop-blur-md border border-white/15 rounded-xl p-3 flex items-center justify-between gap-3 shadow-md"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/20">
                        <Image
                          src={task.avatar}
                          alt={task.assignee}
                          width={32}
                          height={32}
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-xs font-bold text-white truncate">
                          {task.title}
                        </h5>
                        <p className="text-[11px] text-white/70 truncate">
                          {task.client} &bull; <span className="text-white/90 font-medium">{task.assignee}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${task.priorityBg}`}
                      >
                        {task.priority}
                      </span>
                      <span className="text-[11px] font-medium text-white/60 hidden sm:inline">
                        {task.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Summary Bar */}
              <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs text-white/70">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  42 Tasks Completed Today
                </span>
                <span className="font-semibold text-white">99.1% On-Time SLA</span>
              </div>
            </motion.div>
          )}

          {/* TAB 3: ELY AI ENGINE */}
          {activeTab === "ai" && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative w-full h-full flex flex-col justify-between z-10"
            >
              {/* AI Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-400/20 border border-amber-300/40 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  </div>
                  <span className="text-xs font-bold text-white">
                    ELY Field Intelligence Assistant
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
                  v2.4 Neural Model
                </span>
              </div>

              {/* AI Chat / Insight Box */}
              <div className="flex-1 bg-black/30 backdrop-blur-md rounded-2xl border border-white/15 p-4 flex flex-col justify-between gap-3">
                <div className="space-y-3">
                  <div className="bg-white/10 rounded-xl p-2.5 text-xs text-white/90 border border-white/10 self-start max-w-[90%]">
                    <span className="font-semibold text-amber-300 block mb-0.5">
                      Operational Query
                    </span>
                    &ldquo;Suggest route optimization for Lagos Central field reps.&rdquo;
                  </div>

                  <div className="bg-[#133139]/80 rounded-xl p-3 text-xs text-white border border-[#9BDD7C]/30 shadow-md">
                    <div className="flex items-center gap-1.5 text-[#9BDD7C] font-bold mb-1">
                      <Zap className="w-3.5 h-3.5" />
                      ELY Smart Recommendation
                    </div>
                    <p className="text-white/80 leading-relaxed text-[11px]">
                      Re-ordering Sarah M.&apos;s 4 afternoon visits saves 28 minutes of transit time and cuts vehicle fuel costs by ~18%.
                    </p>
                  </div>
                </div>

                {/* AI Performance Pill */}
                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-white/10">
                  <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                    <span className="text-[10px] text-white/60 block">Route Saved</span>
                    <span className="text-xs font-bold text-[#9BDD7C]">42 km/day</span>
                  </div>
                  <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                    <span className="text-[10px] text-white/60 block">Visit Rate</span>
                    <span className="text-xs font-bold text-amber-300">+35% / week</span>
                  </div>
                  <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                    <span className="text-[10px] text-white/60 block">Map Credits</span>
                    <span className="text-xs font-bold text-sky-300">4.8k / 5k</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom KPI Ticker */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
        <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl sm:rounded-2xl p-2 sm:p-3 flex items-center gap-1.5 sm:gap-2.5 text-white shadow-lg">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
            <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] text-white/60 block font-medium truncate">Field Force</span>
            <span className="text-[11px] sm:text-xs font-bold text-white truncate block">18/20 Active</span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl sm:rounded-2xl p-2 sm:p-3 flex items-center gap-1.5 sm:gap-2.5 text-white shadow-lg">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] text-white/60 block font-medium truncate">Daily Visits</span>
            <span className="text-[11px] sm:text-xs font-bold text-white truncate block">142 Logged</span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl sm:rounded-2xl p-2 sm:p-3 flex items-center gap-1.5 sm:gap-2.5 text-white shadow-lg">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
            <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-300" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] text-white/60 block font-medium truncate">Offline Sync</span>
            <span className="text-[11px] sm:text-xs font-bold text-white truncate block">100% Sync</span>
          </div>
        </div>
      </div>
    </div>
  );
}
