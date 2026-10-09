export function ProjectCardSkeleton() {
  return (
    <div className="relative pb-5 h-full">
      <div
        className="bg-white rounded-3xl p-5 pt-6 border border-gray-100/80 animate-pulse h-full flex flex-col"
        style={{ boxShadow: "0px 1px 2px 2px #00000026" }}
      >
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="h-4 w-3/4 bg-gray-200 rounded-full" />
          <div className="h-4 w-4 bg-gray-200 rounded-full shrink-0 mt-0.5" />
        </div>

        {/* Description lines */}
        <div className="mt-3 space-y-1.5">
          <div className="h-2.5 w-full bg-gray-100 rounded-full" />
          <div className="h-2.5 w-5/6 bg-gray-100 rounded-full" />
          <div className="h-2.5 w-2/3 bg-gray-100 rounded-full" />
        </div>

        {/* Deadline */}
        <div className="h-2.5 w-1/3 bg-gray-100 rounded-full mt-auto pt-4" />

        {/* Badges */}
        <div className="flex items-center gap-2 mt-3">
          <div className="h-5 w-20 bg-gray-200 rounded-full" />
          <div className="h-5 w-14 bg-gray-200 rounded-full" />
        </div>

        {/* Progress bars */}
        <div className="flex gap-2 mt-4">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full" />
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full" />
        </div>

        {/* Labels */}
        <div className="flex gap-2 mt-1.5 mb-3">
          <div className="flex-1 h-2 w-16 bg-gray-100 rounded-full" />
          <div className="flex-1 h-2 w-12 bg-gray-100 rounded-full" />
        </div>
      </div>

      {/* Button stub */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <div className="h-10 w-32 bg-gray-200 rounded-full animate-pulse" />
      </div>
    </div>
  );
}
