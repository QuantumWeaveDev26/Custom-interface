import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["bullmq", "ioredis", "@volcengine/tos-sdk"],
  experimental: {
    optimizePackageImports: ["@creative-ai/db", "@creative-ai/shared-types"],
  },
  /**
   * Let a `./thing.js` import resolve to `./thing.ts`.
   *
   * Some files under src/server are compiled twice: by Next for the app, and by
   * tsc for the test build, which runs NodeNext and therefore *requires* the
   * `.js` extension on relative imports. Without this alias those two demands
   * are contradictory — the extension that makes the tests compile makes the
   * app build fail with "Can't resolve ./character-trust.js", which is exactly
   * what happened.
   */
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      ...webpackConfig.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return webpackConfig;
  },
};

export default config;
