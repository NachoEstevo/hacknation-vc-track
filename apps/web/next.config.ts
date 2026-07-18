import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: workspaceRoot,
  outputFileTracingIncludes: {
    "/investor": ["../../data/source/clay-companies.csv"],
    "/investor/search": ["../../data/source/clay-companies.csv"],
  },
  transpilePackages: ["@hacknation/data-core"],
  typedRoutes: true,
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
