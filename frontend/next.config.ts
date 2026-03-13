import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // strict mode double-mounts break imperative chart libs
};

export default nextConfig;
