import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "blue" | "ghost" | "outline" | "destructive";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[#F2A65A] text-[#30343B] font-bold shadow-sm hover:bg-[#E59443] active:bg-[#D48432] focus-visible:outline-[#F2A65A]",
  secondary:
    "border border-[#E6E6E6] bg-white text-[#30343B] font-semibold hover:border-[#D1D5DB] hover:bg-[#F7F7F6] focus-visible:outline-[#3978B8]",
  blue:
    "bg-[#3978B8] text-white font-semibold shadow-sm hover:bg-[#2F659C] active:bg-[#204D7D] focus-visible:outline-[#3978B8]",
  ghost:
    "text-[#666D7A] hover:bg-[#F7F7F6] hover:text-[#30343B] focus-visible:outline-[#3978B8]",
  outline:
    "border border-[#3978B8] bg-transparent text-[#3978B8] font-semibold hover:bg-[#EFF6FC] focus-visible:outline-[#3978B8]",
  destructive:
    "border border-rose-200 bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100 focus-visible:outline-rose-500",
};

export function Button({ className = "", variant = "primary", type = "button", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      type={type}
      {...props}
    />
  );
}
