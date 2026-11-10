import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export default function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`w-full h-[60px] px-7 rounded-full border shadow-[0px_1px_2px_0px_#0000004D] border-gray-200 text-xs text-[#34373C] outline-none focus:border-[#A9AAAB] placeholder:text-[#A9AAAB] transition-colors ${className}`}
      {...props}
    />
  );
}
