export function ProjectDetailsSkeleton() {
  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8 animate-pulse">
      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* ── LEFT: header + kanban ─────────────────────────── */}
        <div className="flex-1 xl:flex-3 min-w-0 flex flex-col gap-5 w-full">
          {/* Header row */}
          <div className="flex flex-col gap-6 mb-8">
            <div className="flex flex-col md:flex-row items-start gap-4 md:gap-12">
              <div className="w-6 h-6 mt-1 bg-gray-200 rounded-full shrink-0" />
              
              <div className="flex-1 w-full">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="space-y-2 w-full md:w-1/2">
                    <div className="h-6 bg-gray-200 rounded-lg w-3/4" />
                    <div className="h-4 bg-gray-200 rounded-lg w-full" />
                    <div className="h-4 bg-gray-200 rounded-lg w-5/6" />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="h-10 md:h-11 bg-gray-200 rounded-xl w-24 flex-1 sm:flex-initial" />
                    <div className="h-10 md:h-11 bg-gray-200 rounded-xl w-36 flex-1 sm:flex-initial" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 mt-6 md:mt-8">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-20" />
                    <div className="h-4 bg-gray-200 rounded w-32" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-20" />
                    <div className="h-4 bg-gray-200 rounded w-40" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-20" />
                    <div className="h-6 bg-gray-200 rounded-full w-24 mt-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Kanban Board Skeleton */}
          <div className="flex gap-4 overflow-x-hidden pt-4">
            {[1, 2, 3].map((col) => (
              <div key={col} className="w-80 shrink-0 bg-white/50 border border-gray-100 rounded-[20px] p-4 flex flex-col gap-3">
                <div className="h-5 bg-gray-200 rounded w-1/2 mb-2" />
                {[1, 2, 3].map((card) => (
                  <div key={card} className="bg-white border border-gray-100 rounded-[14px] p-4 shadow-sm space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="w-8 h-8 rounded-full bg-gray-200" />
                      <div className="h-4 w-16 bg-gray-200 rounded" />
                    </div>
                    <div className="h-4 w-3/4 bg-gray-200 rounded" />
                    <div className="h-3 w-full bg-gray-200 rounded" />
                    <div className="h-3 w-5/6 bg-gray-200 rounded" />
                    <div className="flex gap-2 pt-2">
                      <div className="h-5 w-16 bg-gray-200 rounded-full" />
                      <div className="h-5 w-16 bg-gray-200 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: stats + calendar ───────────────────────── */}
        <div className="w-full sm:max-w-sm xl:max-w-85 xl:flex-1 xl:min-w-70 flex flex-col gap-5 xl:shrink-0">
          <div className="bg-white rounded-[28px] px-5 pt-5 pb-6 border border-gray-100">
            <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
            <div className="flex items-center justify-between gap-4">
              <div className="w-40 h-40 rounded-full bg-gray-200 shrink-0" />
              <div className="space-y-4 flex-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-gray-200 shrink-0" />
                    <div className="h-3 w-20 bg-gray-200 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[28px] p-5 h-80 border border-gray-100" />
        </div>
      </div>
    </div>
  );
}
