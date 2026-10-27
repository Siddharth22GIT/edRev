"use client";

import { useEffect, useRef } from "react";

const CELL = 7; // grid spacing of settled dots (px)
const DOT = 2.6; // dot radius (px)
const BUILD_MS = 4000; // time to build the full range, independent of frame rate
const SNOW_PER_SECOND = 12; // gentle snowfall once the range is built

// Mountain silhouette as fractions of the canvas: centre, height, half-width
const PEAKS = [
  { c: 0.7, h: 0.82, s: 0.42 },
  { c: 0.27, h: 0.56, s: 0.33 },
  { c: 0.98, h: 0.38, s: 0.2 },
];

interface Faller {
  col: number;
  x: number;
  y: number;
  vy: number;
  color: string;
  snow: boolean;
}

/** Snowcap at the top of each column, warm orange through the middle, brand blue at the base. */
function settledColor(row: number, cap: number): string {
  const t = cap > 0 ? row / cap : 0;
  const r = Math.random();
  if (t > 0.86) return r < 0.75 ? "#FEF6EE" : "#FBD7B3";
  if (t > 0.62) return r < 0.6 ? "#FBD7B3" : "#F2A65A";
  if (t > 0.3) return r < 0.7 ? "#F2A65A" : "#E59443";
  return r < 0.55 ? "#3978B8" : r < 0.85 ? "#2F659C" : "#F2A65A";
}

/**
 * Login backdrop: orange and blue dots fall and pile into a snow-capped mountain range
 * (the "avalanche" in REVALANCHE), then a light snowfall continues. Respects reduced motion.
 */
export function AvalancheCanvas({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pile = document.createElement("canvas"); // settled dots are drawn once, here
    const pileCtx = pile.getContext("2d")!;

    let width = 0;
    let height = 0;
    let caps: number[] = [];
    let heights: number[] = [];
    let remaining = 0;
    let spawnPerMs = 0;
    let spawnBudget = 0;
    let fallers: Faller[] = [];
    let frame = 0;
    let lastTime = 0;
    let hasRun = false;

    const surfaceY = (col: number) => height - heights[col] * CELL;

    const drawDot = (target: CanvasRenderingContext2D, x: number, y: number, color: string, radius = DOT, alpha = 1) => {
      target.globalAlpha = alpha;
      target.fillStyle = color;
      target.beginPath();
      target.arc(x, y, radius, 0, Math.PI * 2);
      target.fill();
      target.globalAlpha = 1;
    };

    const settle = (col: number) => {
      const row = heights[col];
      const x = col * CELL + CELL / 2 + (Math.random() - 0.5) * 1.4;
      const y = height - (row + 0.5) * CELL + (Math.random() - 0.5) * 1.4;
      drawDot(pileCtx, x, y, settledColor(row, caps[col]));
      heights[col] += 1;
      remaining -= 1;
    };

    const setup = (instant: boolean) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      for (const c of [canvas, pile]) {
        c.width = width * dpr;
        c.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pileCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(width / CELL);
      caps = Array.from({ length: cols }, (_, col) => {
        const x = (col + 0.5) / cols;
        const frac = Math.max(0.03, ...PEAKS.map((p) => p.h * (1 - Math.abs(x - p.c) / p.s)));
        return Math.floor((frac * height) / CELL);
      });
      heights = caps.map(() => 0);
      remaining = caps.reduce((a, b) => a + b, 0);
      spawnPerMs = remaining / BUILD_MS;
      spawnBudget = 0;
      fallers = [];

      if (instant) {
        caps.forEach((cap, col) => {
          while (heights[col] < cap) settle(col);
        });
      }
      render();
    };

    const pickOpenColumn = (): number => {
      for (let attempt = 0; attempt < 12; attempt++) {
        const col = Math.floor(Math.random() * caps.length);
        if (heights[col] < caps[col]) return col;
      }
      return caps.findIndex((cap, col) => heights[col] < cap);
    };

    // Snow slides downhill: move to a lower neighbour until the slope is stable
    const slide = (col: number): number => {
      let c = col;
      for (let step = 0; step < 6; step++) {
        const options = [c - 1, c + 1].filter(
          (n) => n >= 0 && n < caps.length && heights[n] < caps[n] && heights[n] < heights[c] - 1
        );
        if (options.length === 0) break;
        c = options.reduce((best, n) => (heights[n] < heights[best] ? n : best), options[0]);
      }
      return c;
    };

    const spawn = (dt: number) => {
      if (remaining > 0) {
        spawnBudget += spawnPerMs * dt;
        const count = Math.floor(spawnBudget);
        spawnBudget -= count;
        for (let i = 0; i < count; i++) {
          const col = pickOpenColumn();
          if (col < 0) break;
          const roll = Math.random();
          fallers.push({
            col,
            x: col * CELL + CELL / 2,
            y: -10 - Math.random() * 80,
            vy: 2 + Math.random() * 3,
            color: roll < 0.6 ? "#F2A65A" : roll < 0.85 ? "#FBD7B3" : "#C2DCF2",
            snow: false,
          });
        }
      } else {
        spawnBudget += (SNOW_PER_SECOND / 1000) * dt;
        while (spawnBudget >= 1) {
          spawnBudget -= 1;
          const col = Math.floor(Math.random() * caps.length);
          fallers.push({ col, x: col * CELL + CELL / 2, y: -6, vy: 0.6 + Math.random() * 0.8, color: "#FEF6EE", snow: true });
        }
      }
    };

    // `k` scales motion to a 60fps frame so speed is the same on fast and slow devices
    const step = (k: number) => {
      const next: Faller[] = [];
      for (const f of fallers) {
        if (f.snow) {
          f.y += f.vy * k;
          f.x += Math.sin((f.y + f.col * 13) / 28) * 0.35;
          if (f.y < surfaceY(f.col) - CELL) next.push(f);
          continue;
        }
        f.vy = Math.min(f.vy + 0.35 * k, 13);
        f.y += f.vy * k;
        if (f.y >= surfaceY(f.col) - CELL / 2) {
          const target = slide(f.col);
          if (heights[target] < caps[target]) settle(target);
          else if (heights[f.col] < caps[f.col]) settle(f.col);
        } else {
          next.push(f);
        }
      }
      fallers = next;
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(pile, 0, 0, width, height);
      for (const f of fallers) {
        if (f.snow) drawDot(ctx, f.x, f.y, f.color, 1.6, 0.7);
        else drawDot(ctx, f.x, f.y, f.color);
      }
    };

    const loop = (now: number) => {
      const dt = lastTime ? Math.min(now - lastTime, 100) : 16.7;
      lastTime = now;
      spawn(dt);
      step(dt / 16.7);
      render();
      frame = requestAnimationFrame(loop);
    };

    setup(reduceMotion);
    hasRun = true;
    if (!reduceMotion) frame = requestAnimationFrame(loop);

    // On a real size change: redraw the finished range if it was complete, otherwise restart the build-up.
    // (ResizeObserver also fires once on observe, which is ignored.)
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      if (hasRun && (Math.floor(rect.width) !== width || Math.floor(rect.height) !== height)) {
        setup(reduceMotion || remaining <= 0);
      }
    });
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas aria-hidden="true" className={className} ref={canvasRef} />;
}
