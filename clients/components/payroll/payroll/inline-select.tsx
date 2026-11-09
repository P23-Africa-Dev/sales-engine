import { SearchableSelect, type SelectOption } from "@/components/ui/searchable-select";

type InlineSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function InlineSelect({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  disabled,
}: InlineSelectProps) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      className={`h-12.25 w-full pl-4 pr-3 rounded-xl border border-gray-200 text-[10px] font-light text-[#616263] bg-white shadow-[0px_1px_3px_1px_#00000026,0px_1px_2px_0px_#0000004D] cursor-pointer ${className}`}
    />
  );
}
