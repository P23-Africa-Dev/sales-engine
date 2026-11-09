import { SearchableSelect } from "@/components/ui/searchable-select";

interface FilterSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly T[];
}

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
}: FilterSelectProps<T>) {
  return (
    <SearchableSelect
      value={value}
      onChange={(v) => onChange(v as T)}
      options={options.map((o) => ({ value: o, label: o }))}
      className="appearance-none text-[9px] leading-3.5 font-medium bg-[#5E5D5D] text-white px-1.5 pr-3 py-px rounded-[3px] transition-colors hover:bg-[#3F4254] cursor-pointer"
    />
  );
}
