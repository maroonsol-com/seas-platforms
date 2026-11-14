import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(appDirectory, "..");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return [
      { source: "/apple-touch-icon.png", destination: "/favicon.ico" },
      { source: "/apple-touch-icon-precomposed.png", destination: "/favicon.ico" },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@saas/shared", "@saas/auth-core"],
  turbopack: {
    root: monorepoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
