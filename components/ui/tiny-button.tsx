export function TinyButton({ children = "View", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="bg-[#5E5D5D] rounded-[3px] py-px px-1.5 text-[9px] font-medium text-white"
      {...props}
    >
      {children}
    </button>
  );
}
