export function FormRow({
  label,
  children,
  className = "",
  labelClassName = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  labelClassName?: string;
}) {
  const hasCustomWidth = labelClassName.split(" ").some(cls => cls.startsWith("w-"));
  const cleanedLabelClass = labelClassName
    .split(" ")
    .map(cls => cls.startsWith("w-") ? `sm:${cls}` : cls)
    .join(" ");
  
  const widthClass = hasCustomWidth ? "w-full" : "w-full sm:w-28";

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 ${className}`}>
      <label className={`text-[12px] text-gray-400 font-medium sm:shrink-0 ${widthClass} ${cleanedLabelClass}`}>
        {label}
      </label>
      <div className="flex-1 min-w-0 w-full flex justify-start sm:justify-end">{children}</div>
    </div>
  );
}
