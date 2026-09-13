import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@edurev/mock-data", "@edurev/types"],
};

export default nextConfig;
