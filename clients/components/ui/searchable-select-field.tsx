"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  count?: number;
  badge?: string;
  description?: string;
  keywords?: string;
}

export interface SearchableSelectFieldProps {
  id?: string;
  label?: ReactNode;
  icon?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: readonly SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  ariaLabel?: string;
  disabled?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  defaultValue?: string;
  variant?: "scope" | "filter" | "form";
  className?: string;
}

interface DropdownPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  above: boolean;
}

const MIN_DROPDOWN_WIDTH = 240;
const VIEWPORT_GAP = 10;
const ESTIMATED_DROPDOWN_HEIGHT = 330;

export function SearchableSelectField({
  id,
  label,
  icon,
  value,
  onChange,
  options,
  placeholder = "Select option…",
  searchPlaceholder = "Search options…",
  emptyMessage = "No matching options found.",
  ariaLabel,
  disabled = false,
  searchable = true,
  clearable = false,
  defaultValue = "all",
  variant = "scope",
  className = "",
}: SearchableSelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? `crm-select-${generatedId.replaceAll(":", "")}`;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<DropdownPosition | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? options[0],
    [options, value],
  );

  const isFilteredSelection =
    Boolean(selectedOption) && value !== defaultValue && defaultValue !== "";

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) =>
      `${opt.label} ${opt.value} ${opt.description ?? ""} ${opt.keywords ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [options, search]);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const above =
      spaceBelow < ESTIMATED_DROPDOWN_HEIGHT &&
      rect.top > ESTIMATED_DROPDOWN_HEIGHT;
    const width = Math.max(rect.width, MIN_DROPDOWN_WIDTH);
    const maxLeft = Math.max(
      VIEWPORT_GAP,
      window.innerWidth - width - VIEWPORT_GAP,
    );
    const left = Math.min(Math.max(VIEWPORT_GAP, rect.left), maxLeft);

    setPos({
      top: above ? undefined : rect.bottom + 6,
      bottom: above ? window.innerHeight - rect.top + 6 : undefined,
      left,
      width,
      above,
    });
  }, []);

  const closeDropdown = useCallback((restoreFocus = false) => {
    setOpen(false);
    setSearch("");
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    const hostDialog = triggerRef.current?.closest("dialog");
    setPortalTarget(hostDialog ?? document.body);
    updatePosition();
    const currentIdx = Math.max(
      0,
      options.findIndex((opt) => opt.value === value),
    );
    setActiveIndex(currentIdx);
    setSearch("");
    setOpen(true);
  }, [disabled, options, updatePosition, value]);

  const toggleDropdown = () => {
    if (open) {
      closeDropdown();
    } else {
      openDropdown();
    }
  };

  const selectOption = useCallback(
    (opt: SearchableSelectOption) => {
      onChange(opt.value);
      closeDropdown(true);
    },
    [closeDropdown, onChange],
  );

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      if (searchable) {
        searchInputRef.current?.focus();
      } else {
        optionRefs.current[activeIndex]?.focus();
      }
    }, 15);
    return () => window.clearTimeout(focusTimer);
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        closeDropdown(false);
      }
    };
    const handleScrollOrResize = () => {
      updatePosition();
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [closeDropdown, open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        openDropdown();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeDropdown(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) =>
        filteredOptions.length ? (prev + 1) % filteredOptions.length : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) =>
        filteredOptions.length
          ? (prev - 1 + filteredOptions.length) % filteredOptions.length
          : 0,
      );
      return;
    }

    if (event.key === "Home" && !searchable) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End" && !searchable) {
      event.preventDefault();
      setActiveIndex(Math.max(0, filteredOptions.length - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const targetOption = filteredOptions[activeIndex];
      if (targetOption) {
        selectOption(targetOption);
      }
    }
  };

  const dropdownPanel =
    open && pos && portalTarget
      ? createPortal(
          <div
            ref={dropdownRef}
            className={`crm-select-portal crm-select-portal-${variant}`}
            style={{
              position: "fixed",
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              width: pos.width,
              zIndex: 100000,
            }}
            onKeyDown={handleKeyDown}
          >
            {searchable && (
              <div className="crm-select-search">
                <Search size={14} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  aria-label={searchPlaceholder}
                  placeholder={searchPlaceholder}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setActiveIndex(0);
                  }}
                />
                {search && (
                  <button
                    type="button"
                    className="crm-select-search-clear"
                    aria-label="Clear search query"
                    onClick={() => {
                      setSearch("");
                      setActiveIndex(0);
                      searchInputRef.current?.focus();
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            <div className="crm-select-options">
              {filteredOptions.length === 0 ? (
                <div className="crm-select-empty">
                  <p>{emptyMessage}</p>
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setActiveIndex(0);
                        searchInputRef.current?.focus();
                      }}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === activeIndex;
                  return (
                    <button
                      key={opt.value}
                      ref={(node) => {
                        optionRefs.current[idx] = node;
                      }}
                      type="button"
                      className={`crm-select-option ${isSelected ? "is-selected" : ""} ${isHighlighted ? "is-highlighted" : ""}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => selectOption(opt)}
                    >
                      <span className="crm-select-option-main">
                        <span className="crm-select-option-label">
                          {opt.label}
                        </span>
                        {opt.description && (
                          <small className="crm-select-option-desc">
                            {opt.description}
                          </small>
                        )}
                      </span>
                      <span className="crm-select-option-meta">
                        {opt.badge && (
                          <span className="crm-select-option-badge">
                            {opt.badge}
                          </span>
                        )}
                        {opt.count !== undefined && (
                          <span className="crm-select-option-count">
                            {opt.count}
                          </span>
                        )}
                        {isSelected && (
                          <Check
                            size={14}
                            className="crm-select-option-check"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          portalTarget,
        )
      : null;

  return (
    <div
      className={`crm-select-field crm-select-field-${variant} ${className}`}
    >
      {label && (
        <label htmlFor={fieldId} className="crm-select-label">
          {icon}
          <span>{label}</span>
        </label>
      )}
      <div className="crm-select-control">
        <button
          ref={triggerRef}
          id={fieldId}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-label={
            ariaLabel ?? (typeof label === "string" ? label : placeholder)
          }
          className={`crm-select-trigger ${open ? "is-open" : ""} ${isFilteredSelection ? "is-filtered" : ""}`}
          onClick={toggleDropdown}
          onKeyDown={handleKeyDown}
        >
          <span className="crm-select-trigger-text">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <span className="crm-select-trigger-Right">
            {selectedOption?.count !== undefined && (
              <span className="crm-select-trigger-count">
                {selectedOption.count}
              </span>
            )}
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`crm-select-chevron ${open ? "is-open" : ""}`}
            />
          </span>
        </button>
        {clearable && isFilteredSelection && (
          <button
            type="button"
            className="crm-select-clear-btn"
            aria-label={`Reset ${typeof label === "string" ? label : "selection"}`}
            title="Reset filter"
            onClick={(e) => {
              e.stopPropagation();
              onChange(defaultValue);
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>
      {dropdownPanel}
    </div>
  );
}
