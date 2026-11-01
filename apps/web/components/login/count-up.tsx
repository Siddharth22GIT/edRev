"use client";

import { useEffect, useState } from "react";

/** Counts from 0 to `value` once on mount (ease-out). Shows the final value immediately under reduced motion. */
export function CountUp({ value, suffix = "", duration = 1400, delay = 0 }: { value: number; suffix?: string; duration?: number; delay?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [value, duration, delay]);

  return (
    <span className="tabular-nums">
      {display}
      {suffix}
    </span>
  );
}
