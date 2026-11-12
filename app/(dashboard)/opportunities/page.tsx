import { OpportunitiesView } from "@/components/sales-engine/opportunities-view";

export default function OpportunitiesPage() {
  return (
    <div className="se-workspace min-h-[calc(100vh-80px)] overflow-x-hidden bg-[#f8f8f8] px-6 py-8 text-[#09232d] max-sm:px-4">
      <div className="mx-auto flex w-full max-w-[1340px] flex-col gap-7">
        <OpportunitiesView />
      </div>
    </div>
  );
}
