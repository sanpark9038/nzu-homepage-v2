import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'eloboard.com' },
      { protocol: 'http', hostname: 'eloboard.com' },
      { protocol: 'https', hostname: 'ssustar.iwinv.net' },
      { protocol: 'https', hostname: 'www.cnine.kr' },
    ],
  },
};

export default nextConfig;
