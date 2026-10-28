"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** Circular progress ring (fills in on mount; static under reduced motion). */
export function RingStat({
  value,
  max = 100,
  display,
  label,
  caption,
  color = "#F2A65A",
  size = 132,
}: {
  value: number;
  max?: number;
  display: string;
  label: string;
  caption?: string;
  color?: string;
  size?: number;
}) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = Math.min(1, Math.max(0, max > 0 ? value / max : 0));
  const [fill, setFill] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setFill(target);
      return;
    }
    const timer = setTimeout(() => setFill(target), 60);
    return () => clearTimeout(timer);
  }, [target]);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90" height={size} width={size}>
          <circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke="#F1EFEC" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fill)}
            strokeLinecap="round"
            strokeWidth={stroke}
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-2xl font-extrabold text-[#30343B]">{display}</span>
      </div>
      <p className="mt-3 text-sm font-bold text-[#30343B]">{label}</p>
      {caption && <p className="mt-0.5 text-xs text-[#666D7A]">{caption}</p>}
    </div>
  );
}
