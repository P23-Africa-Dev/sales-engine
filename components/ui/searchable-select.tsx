"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Check } from "lucide-react";

export type SelectOption = { value: string; label: string };

const DROPDOWN_MIN_WIDTH = 200;
const DROPDOWN_EDGE_GAP = 8;
const DROPDOWN_LIST_HEIGHT = 240;
const DROPDOWN_ESTIMATED_HEIGHT = DROPDOWN_LIST_HEIGHT + 52;

type DropdownPos = { top: number; left: number; width: number; above: boolean };
type SearchableSelectVariant = "default" | "enterprise";

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  variant?: SearchableSelectVariant;
};

const variantStyles: Record<
  SearchableSelectVariant,
  {
    panel: string;
    searchWrap: string;
    searchIcon: string;
    searchInput: string;
    list: string;
    empty: string;
    option: string;
    optionActive: string;
    check: string;
    placeholder: string;
    chevron: string;
    chevronOpen: string;
  }
> = {
  default: {
    panel:
      "bg-white border border-gray-200 rounded-2xl shadow-[0px_8px_24px_rgba(0,0,0,0.12)]",
    searchWrap: "border-b border-gray-100",
    searchIcon: "text-gray-400",
    searchInput: "text-[12px] text-gray-700 placeholder:text-gray-400",
    list: "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200",
    empty: "text-gray-400",
    option: "text-gray-700 hover:bg-gray-50",
    optionActive: "bg-gray-50 text-[#0B1215] font-semibold",
    check: "text-[#0B1215]",
    placeholder: "text-gray-400",
    chevron: "text-gray-400",
    chevronOpen: "text-gray-400",
  },
  enterprise: {
    panel:
      "bg-[#0A1618]/95 border border-white/10 rounded-[20px] shadow-[0px_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl",
    searchWrap: "border-b border-white/10",
    searchIcon: "text-white/40",
    searchInput: "text-[12px] text-white placeholder:text-white/30",
    list:
      "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 hover:[&::-webkit-scrollbar-thumb]:bg-[#6FA8A6]/40",
    empty: "text-white/40",
    option: "text-white/80 hover:bg-white/[0.06] hover:text-white",
    optionActive: "bg-[#6FA8A6]/15 text-[#6FA8A6] font-semibold",
    check: "text-[#6FA8A6]",
    placeholder: "text-white/20",
    chevron: "text-white/40",
    chevronOpen: "text-[#6FA8A6]",
  },
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className = "",
  disabled = false,
  leftIcon,
  variant = "default",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mounted] = useState(() => typeof document !== "undefined");

  const selected = options.find((o) => o.value === value);
  const styles = variantStyles[variant];

  const calcPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < DROPDOWN_ESTIMATED_HEIGHT && rect.top > DROPDOWN_ESTIMATED_HEIGHT;

    const dropWidth = Math.max(rect.width, DROPDOWN_MIN_WIDTH);

    const rawLeft = rect.left;
    const maxLeft = window.innerWidth - dropWidth - DROPDOWN_EDGE_GAP;
    const left =
      rawLeft > maxLeft
        ? Math.max(DROPDOWN_EDGE_GAP, rect.right - dropWidth)
        : Math.max(DROPDOWN_EDGE_GAP, rawLeft);

    setPos({
      top: above ? rect.top : rect.bottom + 6,
      left,
      width: dropWidth,
      above,
    });
  }, []);

  const openDropdown = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (disabled) return;
    calcPos();
    setOpen(true);
    setSearch("");
  };

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = () => {
      calcPos();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", calcPos);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open, close, calcPos]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open]);

  const query = search.trim().toLowerCase();
  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(query) ||
      o.value.toLowerCase().includes(query)
  );

  const pick = (opt: SelectOption) => {
    onChange(opt.value);
    close();
  };

  const dropdown =
    open && pos && mounted
      ? createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: pos.above ? undefined : pos.top,
            bottom: pos.above ? window.innerHeight - pos.top + 6 : undefined,
            left: pos.left,
            width: pos.width,
            zIndex: 99999,
          }}
          className={`overflow-hidden flex flex-col ${styles.panel}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className={`flex items-center gap-2.5 px-4 py-3 ${styles.searchWrap}`}>
            <Search size={14} className={`shrink-0 ${styles.searchIcon}`} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className={`flex-1 outline-none bg-transparent ${styles.searchInput}`}
            />
          </div>

          <div
            className={`overflow-y-auto ${styles.list}`}
            style={{ height: DROPDOWN_LIST_HEIGHT }}
          >
            {filtered.length === 0 ? (
              <p className={`text-center text-[12px] py-8 ${styles.empty}`}>No results found</p>
            ) : (
              filtered.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => pick(opt)}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-[12px] text-left transition-colors cursor-pointer ${active ? styles.optionActive : styles.option
                      }`}
                  >
                    <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                      {opt.label}
                    </span>
                    {active && <Check size={13} className={`shrink-0 ${styles.check}`} />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex items-center gap-2 text-left ${open && variant === "enterprise" ? "border-[#6FA8A6]/50 bg-white/[0.08]" : ""
          } ${className}`}
      >
        {leftIcon && <span className="shrink-0">{leftIcon}</span>}
        <span className={`flex-1 truncate ${!selected ? styles.placeholder : ""}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""} ${open ? styles.chevronOpen : styles.chevron
            }`}
        />
      </button>
      {dropdown}
    </>
  );
}
