import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by the Docker runner stage (ADR-0006).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
