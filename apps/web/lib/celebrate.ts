"use client";

import { celebrationsEnabled, prefersReducedMotion } from "@/lib/motion";

const COLORS = ["#F2A65A", "#FBD7B3", "#FEF6EE", "#3978B8", "#C2DCF2", "#E59443"];

/**
 * A short "snow burst" of brand-coloured dots from the centre-top of the screen, used to celebrate
 * a completed action (bid submitted, work allocated, earning verified). Skipped under reduced motion.
 */
export function celebrate() {
  if (typeof window === "undefined" || prefersReducedMotion() || !celebrationsEnabled()) return;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:70";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const originX = width / 2;
  const originY = height * 0.28;
  const particles = Array.from({ length: 90 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      r: 2 + Math.random() * 2.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const duration = 1400;
  let start = 0;
  const frame = (now: number) => {
    if (!start) start = now;
    const t = (now - start) / duration;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.max(0, 1 - t);
    for (const p of particles) {
      p.vy += 0.18;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (t < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
