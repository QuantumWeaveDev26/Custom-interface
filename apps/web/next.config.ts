import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@creative-ai/db", "@creative-ai/shared-types"],
  },
};

export default config;
