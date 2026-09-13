import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-panel ${className}`} {...props}>
      {children}
    </section>
  );
}
