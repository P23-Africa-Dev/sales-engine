"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Check } from "lucide-react";
import PhoneInput, { getCountryCallingCode, type Country } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";

type Variant = "default" | "compact" | "dark" | "enterprise";

interface PhoneNumberInputProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  defaultCountry?: string;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
}

const variantClassName: Record<Variant, string> = {
  default: "phone-input-default",
  compact: "phone-input-compact",
  dark: "phone-input-dark",
  enterprise: "phone-input-enterprise w-full h-[60px] rounded-full border shadow-[0px_1px_2px_0px_#0000004D] text-xs outline-none transition-colors",
};

interface SearchableCountrySelectProps {
  name?: string;
  value?: Country;
  onChange: (value?: Country) => void;
  options: { value?: Country; label: string }[];
  disabled?: boolean;
  readOnly?: boolean;
  iconComponent: React.ComponentType<{ country?: Country; label?: string }>;
  variant?: Variant;
}

function SearchableCountrySelect({
  name,
  value,
  onChange,
  options,
  disabled = false,
  readOnly = false,
  iconComponent,
  variant = "default",
}: SearchableCountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean; triggerHeight: number } | null>(null);
  
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [mounted] = useState(() => typeof document !== "undefined");

  const selectedOption = options.find((o) => o.value === value);
  const selectedLabel = selectedOption ? selectedOption.label : "International";
  const FlagIcon = iconComponent;

  const calcPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    const dropHeight = 290;
    const above = spaceBelow < dropHeight && spaceAbove > dropHeight;
    const dropWidth = 280;

    const rawLeft = rect.left;
    const maxLeft = window.innerWidth - dropWidth - 8;
    const left = Math.max(8, Math.min(maxLeft, rawLeft));

    setPos({
      top: rect.top,
      left,
      width: dropWidth,
      above,
      triggerHeight: rect.height,
    });
  }, []);

  const openDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || readOnly) return;
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
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open]);

  const query = search.trim().toLowerCase();
  const filteredOptions = options.filter((opt) => {
    if (!opt.value) {
      return opt.label.toLowerCase().includes(query);
    }
    const countryCode = opt.value.toLowerCase();
    const countryName = opt.label.toLowerCase();
    let callingCode = "";
    try {
      callingCode = getCountryCallingCode(opt.value);
    } catch (e) {
      // ignore
    }
    return (
      countryCode.includes(query) ||
      countryName.includes(query) ||
      callingCode.includes(query)
    );
  });

  const pick = (opt: { value?: Country; label: string }) => {
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
              top: pos.above ? undefined : pos.top + pos.triggerHeight + 6,
              bottom: pos.above ? window.innerHeight - pos.top + 6 : undefined,
              left: pos.left,
              width: pos.width,
              zIndex: 99999,
            }}
            className="overflow-hidden flex flex-col bg-white border border-gray-200 rounded-2xl shadow-[0px_8px_24px_rgba(0,0,0,0.12)] font-sans"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white">
              <Search size={14} className="text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="flex-1 text-[12px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent font-sans"
              />
            </div>

            {/* List */}
            <div
              className="overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 bg-white"
              style={{ height: 240 }}
            >
              {filteredOptions.length === 0 ? (
                <p className="text-center text-[12px] py-8 text-gray-400 font-sans">No results found</p>
              ) : (
                filteredOptions.map((opt) => {
                  const active = opt.value === value;
                  let callCode = "";
                  if (opt.value) {
                    try {
                      callCode = `+${getCountryCallingCode(opt.value)}`;
                    } catch (e) {
                      // ignore
                    }
                  }
                  return (
                    <button
                      key={opt.value || "ZZ"}
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => pick(opt)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-[12px] text-left transition-colors cursor-pointer font-sans ${
                        active
                          ? "bg-gray-50 text-[#0B1215] font-semibold"
                          : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="shrink-0 w-5 h-4 flex items-center justify-center overflow-hidden rounded-sm border border-gray-100 bg-gray-50">
                          <FlagIcon country={opt.value} label={opt.label} />
                        </span>
                        <span className="truncate">{opt.label}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {callCode && <span className="text-[10px] text-gray-400 font-normal">{callCode}</span>}
                        {active && <Check size={13} className="text-[#0B1215] shrink-0" />}
                      </div>
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
        disabled={disabled || readOnly}
        onClick={openDropdown}
        className="flex items-center gap-1.5 px-2 py-1 cursor-pointer outline-none select-none disabled:cursor-not-allowed disabled:opacity-60 rounded hover:bg-white/5 transition-colors"
      >
        <span className="shrink-0 w-5 h-3.5 flex items-center justify-center overflow-hidden rounded-sm border border-white/10 bg-white/5">
          <FlagIcon country={value} label={selectedLabel} />
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""} ${
            variant === "enterprise" ? "text-white/40" : "text-gray-400"
          }`}
        />
      </button>
      {dropdown}
    </>
  );
}

export default function PhoneNumberInput({
  value,
  onChange,
  placeholder = "Phone Number",
  defaultCountry = "GB",
  variant = "default",
  className,
  disabled,
}: PhoneNumberInputProps) {
  return (
    <PhoneInput
      international
      defaultCountry={defaultCountry as never}
      countryCallingCodeEditable={false}
      placeholder={placeholder}
      value={value || undefined}
      onChange={(next) => onChange(next ?? "")}
      disabled={disabled}
      flags={flags}
      countrySelectComponent={SearchableCountrySelect}
      countrySelectProps={{ variant }}
      className={`${variantClassName[variant]}${className ? ` ${className}` : ""}`}
    />
  );
}
