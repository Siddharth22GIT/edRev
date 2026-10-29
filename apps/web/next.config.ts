import type { NextConfig } from "next";

// S7: Content Security Policy (docs/modules/security.md). It limits where scripts can load from and which
// servers the page may talk to, so injected code can't load outside scripts or send data elsewhere.
// 'unsafe-inline' scripts are still needed by Next.js without nonces; 'unsafe-eval' and ws: only in dev (hot reload).
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").origin;
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", // photos and screenshots are data URLs
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${isDev ? " ws: wss:" : ""}`,
  "frame-src 'self' blob: data:", // proposal PDF preview (data: is the fallback when a file can't be parsed)
  "object-src 'self' blob:", // browser PDF viewer for previews
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Optional override so a production build can run while `next dev` holds `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@edurev/mock-data", "@edurev/types"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
