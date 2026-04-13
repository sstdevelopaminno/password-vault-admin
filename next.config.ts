import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep production optimizations, but avoid extra dev compile overhead.
  reactCompiler: process.env.NODE_ENV === "production",
};

export default nextConfig;
