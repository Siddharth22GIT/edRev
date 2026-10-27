import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optional override so a production build can run while `next dev` holds `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@edurev/mock-data", "@edurev/types"],
};

export default nextConfig;
