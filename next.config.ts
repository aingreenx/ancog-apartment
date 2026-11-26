import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Installable app (#27): the service worker is built from src/app/sw.ts and served at
// /serwist/sw.js by src/app/serwist/[path]/route.ts.
export default withSerwist(nextConfig);
