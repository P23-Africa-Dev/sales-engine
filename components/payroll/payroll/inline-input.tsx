type InlineInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function InlineInput({ className = "", ...props }: InlineInputProps) {
  return (
    <input
      type="text"
      className={`h-12.25 w-full px-4 rounded-xl border border-gray-200 text-[10px] placeholder:text-[10px] font-light text-[#616263] outline-none focus:border-gray-400 transition-colors shadow-[0px_1px_3px_1px_#00000026,0px_1px_2px_0px_#0000004D] ${className}`}
      {...props}
    />
  );
}
