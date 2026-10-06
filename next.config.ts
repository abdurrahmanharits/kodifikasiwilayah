import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder so Turbopack doesn't pick up a
  // stray lockfile in a parent directory (e.g. the user's home folder).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
