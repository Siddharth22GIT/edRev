import { useId } from "react";

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * REVALANCHE brand mark: two peaks (the "avalanche") under a rising earnings line ("rev"),
 * on the brand orange tile. Keep in sync with app/icon.svg (the browser tab icon).
 */
export function LogoMark({ size = 40, className = "" }: LogoMarkProps) {
  const id = useId().replace(/:/g, "");
  const tile = `logo-tile-${id}`;
  const clip = `logo-clip-${id}`;

  return (
    <svg
      aria-label="REVALANCHE"
      className={className}
      height={size}
      role="img"
      viewBox="0 0 40 40"
      width={size}
    >
      <defs>
        <linearGradient id={tile} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#F7BC80" />
          <stop offset="1" stopColor="#E59443" />
        </linearGradient>
        <clipPath id={clip}>
          <rect height="40" rx="11" width="40" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect fill={`url(#${tile})`} height="40" width="40" />
        {/* Back peak */}
        <path d="M11 40 L25 17.5 L42 40 Z" fill="#3978B8" />
        {/* Front peak with snowcap */}
        <path d="M-2 40 L14 19 L28 40 Z" fill="#30343B" />
        <path d="M14 19 L10.6 23.5 L12.6 22.6 L14.2 24.2 L15.9 22.5 L17.3 23.4 Z" fill="#FEF6EE" />
        {/* Rising earnings line */}
        <path d="M6 15.5 L13 11.5 L18.5 14 L29 7.5" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" />
        <path d="M23.8 7 L29 7.5 L27.4 12.4" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" />
      </g>
    </svg>
  );
}
