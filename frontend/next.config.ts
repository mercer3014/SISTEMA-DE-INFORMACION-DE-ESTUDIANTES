import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Servidor autónomo (.next/standalone) para la imagen Docker; Vercel lo ignora.
  output: "standalone",
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

export default nextConfig;
