/* ─── CRM Page Skeleton ───────────────────────────────────── */

function Bone({ className }: { className?: string }) {
  return <div className={`bg-gray-200 rounded-full animate-pulse ${className ?? ""}`} />;
}

function RectBone({ className }: { className?: string }) {
  return <div className={`bg-gray-200 animate-pulse ${className ?? ""}`} />;
}

/* Top bar --------------------------------------------------- */
function TopBarSkeleton() {
  return (
    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
      {/* Search */}
      <Bone className="h-11 w-full max-w-110 rounded-full" />

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Bone className="h-9 w-28 rounded-[10px]" />
        <Bone className="h-9 w-20 rounded-[10px]" />
        <Bone className="h-9 w-20 rounded-[10px]" />
        <Bone className="h-9 w-20 rounded-[10px]" />
        <Bone className="h-9 w-32 rounded-[10px]" />
      </div>
    </div>
  );
}

/* Summary cards --------------------------------------------- */
function TotalLeadsCardSkeleton() {
  return (
    <div className="se-stat-card bg-white rounded-[20px] p-6 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex flex-col justify-between min-w-0 sm:min-w-85 animate-pulse">
      <div className="flex justify-between items-start">
        <Bone className="h-4 w-40" />
        <Bone className="h-5 w-5 rounded-md" />
      </div>

      <div className="flex items-center gap-6 mt-4 justify-between">
        <div className="flex flex-col gap-2">
          <Bone className="h-12 w-32" />
          <Bone className="h-3.5 w-44" />
        </div>
        {/* Donut ring */}
        <div className="relative w-25 h-25 shrink-0 flex items-center justify-center">
          <div className="w-full h-full rounded-full bg-gray-200" />
          <div className="absolute w-[62%] h-[62%] rounded-full bg-white" />
          <Bone className="absolute h-4 w-8 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function LeadsChartSkeleton() {
  return (
    <div className="rounded-3xl p-6 border-gray-100 flex-1 min-w-0 sm:min-w-75 animate-pulse">
      {/* Day labels */}
      <div className="flex items-center justify-between mb-1 px-2">
        {["Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"].map((d) => (
          <Bone key={d} className="h-3 w-7" />
        ))}
      </div>
      {/* Chart area */}
      <div className="h-32.5 w-full bg-gray-100 rounded-2xl" />
    </div>
  );
}

function AgentUploadsCardSkeleton() {
  return (
    <div className="se-stat-card bg-white rounded-[20px] p-6 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex items-center gap-5 min-w-0 sm:min-w-70 animate-pulse">
      {/* Avatar ring */}
      <div className="relative shrink-0 w-20 h-20 rounded-full bg-gray-200" />

      {/* Text */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-1.5">
          <Bone className="h-9 w-20" />
          <Bone className="h-3.5 w-10" />
        </div>
        <Bone className="h-3 w-36" />
        <Bone className="h-3.5 w-20" />
      </div>
    </div>
  );
}

function SummaryCardsSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-4 items-stretch">
      <TotalLeadsCardSkeleton />
      <LeadsChartSkeleton />
      <AgentUploadsCardSkeleton />
    </div>
  );
}

/* Kanban board ---------------------------------------------- */
function LeadCardSkeleton() {
  return (
    <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-sm flex flex-col gap-3 animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5 flex-1">
          <Bone className="h-4 w-3/4" />
          <Bone className="h-3 w-1/2" />
        </div>
        <Bone className="h-6 w-6 rounded-full shrink-0" />
      </div>
      <div className="flex items-center justify-between">
        <Bone className="h-5 w-16 rounded-full" />
        <Bone className="h-3 w-12" />
      </div>
    </div>
  );
}

const SKELETON_COLUMNS = [
  { title: "New Lead", color: "#6366F1" },
  { title: "Contacted", color: "#F59E0B" },
  { title: "Follow Up", color: "#3B82F6" },
  { title: "Negotiation", color: "#10B981" },
  { title: "Closed Won", color: "#FD6046" },
];

function LeadBoardSkeleton() {
  return (
    <div className="se-surface bg-white shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] rounded-t-[30px] mt-6 overflow-hidden flex flex-col h-[calc(100vh-360px)] min-h-[70vh]">
      {/* Board toolbar */}
      <div className="flex items-center justify-end gap-3 px-6 pt-4 pb-2 animate-pulse">
        <Bone className="h-7 w-28 rounded-lg" />
        <div className="flex items-center gap-1">
          <Bone className="h-7 w-7 rounded-md" />
          <Bone className="h-7 w-7 rounded-md" />
        </div>
      </div>

      {/* Mobile stage tabs */}
      <div className="flex md:hidden gap-1.5 overflow-x-auto px-4 pb-3 pt-1 border-b border-gray-100 shrink-0 animate-pulse">
        {SKELETON_COLUMNS.slice(0, 4).map((col) => (
          <Bone key={col.title} className="h-7 w-20 rounded-full shrink-0" />
        ))}
      </div>

      {/* Desktop columns */}
      <div className="hidden md:grid grid-cols-3 lg:grid-cols-5 gap-0 flex-1 overflow-hidden divide-x divide-gray-100">
        {SKELETON_COLUMNS.map((col) => (
          <div key={col.title} className="flex flex-col gap-3 p-4 overflow-y-auto [&::-webkit-scrollbar]:hidden">
            {/* Column header */}
            <div className="flex items-center justify-between px-1 mb-1 animate-pulse">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: col.color }} />
                <Bone className="h-4 w-24" />
              </div>
              <RectBone className="h-5 w-8 rounded-full" />
            </div>
            {/* Cards */}
            <LeadCardSkeleton />
            <LeadCardSkeleton />
            <LeadCardSkeleton />
          </div>
        ))}
      </div>

      {/* Mobile single column */}
      <div className="flex md:hidden flex-col gap-3 p-4 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden">
        <LeadCardSkeleton />
        <LeadCardSkeleton />
        <LeadCardSkeleton />
        <LeadCardSkeleton />
      </div>
    </div>
  );
}

/* Full page skeleton ---------------------------------------- */
export function CRMPageSkeleton() {
  return (
    <div className="se-workspace min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-350 mx-auto flex flex-col gap-5">
        <TopBarSkeleton />
        <SummaryCardsSkeleton />
        <LeadBoardSkeleton />
      </div>
    </div>
  );
}
