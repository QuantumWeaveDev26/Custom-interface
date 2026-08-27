import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["bullmq", "ioredis", "@volcengine/tos-sdk"],
  experimental: {
    optimizePackageImports: ["@creative-ai/db", "@creative-ai/shared-types"],
  },
};

export default config;
