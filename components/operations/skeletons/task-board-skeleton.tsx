export function TaskCardSkeleton() {
  return (
    <div className="bg-white rounded-[32px] p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col gap-6 animate-pulse mb-3">
      <div>
        <div className="h-4 w-1/2 bg-gray-200 rounded-full" />
        <div className="h-3 w-3/4 bg-gray-100 rounded-full mt-2" />
      </div>

      <div className="space-y-2.5">
        <div className="h-4 w-1/4 bg-gray-200 rounded-full" />
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            <div className="h-2.5 w-full bg-gray-100 rounded-full" />
            <div className="h-2.5 w-2/3 bg-gray-100 rounded-full" />
          </div>
          <div className="flex flex-col items-end gap-2.5 shrink-0">
            <div className="h-7 w-24 bg-gray-200 rounded-full" />
            <div className="h-3 w-12 bg-gray-100 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskColumnSkeleton({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          <h3 className="text-[#0B1215] font-bold text-[18px]">{title}</h3>
        </div>
        <div className="h-6 w-10 bg-gray-100 rounded-full" />
      </div>
      <div className="flex flex-col min-h-[500px]">
        <TaskCardSkeleton />
        <TaskCardSkeleton />
        <TaskCardSkeleton />
      </div>
    </div>
  );
}

export function TaskBoardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2 animate-in fade-in duration-500">
      <TaskColumnSkeleton title="Pending Task" />
      <TaskColumnSkeleton title="Task In-Progress" />
      <TaskColumnSkeleton title="Completed Task" />
    </div>
  );
}
