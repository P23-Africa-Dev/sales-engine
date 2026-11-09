import React from "react";

type ButtonVariant = "primary" | "outline";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#6FA8A6] shadow-[0px_1px_2px_0px_#0000004D] active:shadow-[0px_1px_3px_1px_#00000026] text-white hover:bg-[#5e9795]",
  outline:
    "bg-white shadow-[0px_1px_2px_0px_#0000004D,0px_1px_3px_1px_#00000026] border border-gray-200 text-gray-700 hover:bg-gray-50",
};

export default function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`w-full h-[51px] rounded-full text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
