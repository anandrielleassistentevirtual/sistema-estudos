import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: "/anki", destination: "/idiomas/anki", permanent: true }];
  },
};

export default nextConfig;
