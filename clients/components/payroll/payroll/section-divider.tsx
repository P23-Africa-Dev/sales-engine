export function SectionDivider({ label, subtitle }: { label: string; subtitle?: string }) {
  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-[12px] text-gray-400 font-medium whitespace-nowrap">
          {label}
        </span>
        <div className="flex-6 h-px bg-gray-200" />
      </div>
      {subtitle ? (
        <p className="text-[10px] text-gray-400 text-center mt-1">{subtitle}</p>
      ) : null}
    </div>
  );
}
