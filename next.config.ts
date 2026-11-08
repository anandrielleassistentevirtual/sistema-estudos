import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/anki", destination: "/idiomas/anki", permanent: true },
      { source: "/calendario", destination: "/#calendario", permanent: true },
      { source: "/fila", destination: "/biblioteca", permanent: true },
      { source: "/biblioteca/fila", destination: "/biblioteca", permanent: true },
    ];
  },
};

export default nextConfig;
