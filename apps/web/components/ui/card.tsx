import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <section className={`rounded-xl border border-[#E6E6E6] bg-white shadow-card transition-shadow ${className}`} {...props}>
      {children}
    </section>
  );
}
