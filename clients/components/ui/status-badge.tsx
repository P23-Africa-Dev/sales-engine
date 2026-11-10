"use client";

interface StatusBadgeProps {
  status: "Pending" | "Approved" | "Revoked";
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const statusClass =
    status === "Approved"
      ? "bg-[#2F6C0E]"
      : status === "Revoked"
        ? "bg-[#B42318]"
        : "bg-[#EF7129]";

  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] text-white font-medium whitespace-nowrap ${statusClass} ${className}`}
    >
      {status}
    </span>
  );
}
