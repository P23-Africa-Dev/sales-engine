import { useRef, useState } from "react";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
}

export default function OtpInput({
  length = 6,
  value,
  onChange,
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  function syncCursor() {
    const pos = inputRef.current?.selectionStart ?? value.length;
    setCursorPosition(Math.min(pos, length - 1));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, length);
    onChange(raw);
    // After value changes, cursor will be at the new value's length
    setCursorPosition(Math.min(raw.length, length - 1));
  }

  function handleFocus() {
    setFocused(true);
    requestAnimationFrame(() => {
      const pos = value.length >= length ? length - 1 : value.length;
      inputRef.current?.setSelectionRange(pos, pos);
      setCursorPosition(pos);
    });
  }

  const activeIndex = focused
    ? Math.min(cursorPosition, length - 1)
    : -1;

  return (
    <div
      role="group"
      aria-label={`Verification code, ${length} digits`}
      className="relative flex gap-2 md:gap-3 justify-center cursor-text w-full px-[27px] md:px-0"
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="^\d+$"
        maxLength={length}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={() => setFocused(false)}
        onSelect={syncCursor}
        onKeyUp={syncCursor}
        aria-label={`Verification code, ${length} digits`}
        className="absolute inset-0 w-full h-full opacity-0 z-10"
      />

      {Array.from({ length }).map((_, i) => {
        const char = value[i] || "";
        const isActive = i === activeIndex;
        const isFilled = !!char;

        return (
          <div
            key={i}
            className={`
              w-full md:w-[65px] aspect-square md:aspect-auto md:h-[60px] rounded-[10px] border flex items-center justify-center
              text-lg font-medium text-[#34373C] transition-colors
              ${isActive
                ? "border-[#6FA8A6] shadow-[0px_0px_0px_1px_#6FA8A6]"
                : isFilled
                  ? "border-gray-300 shadow-[0px_1px_2px_0px_#0000004D]"
                  : "border-gray-200 shadow-[0px_1px_2px_0px_#0000004D]"
              }
            `}
          >
            {char}
            {isActive && !char && (
              <span className="w-[2px] h-6 bg-[#6FA8A6] animate-pulse rounded-full" />
            )}
          </div>
        );
      })}
    </div>
  );
}
