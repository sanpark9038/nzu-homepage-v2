import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'eloboard.com' },
      { protocol: 'http', hostname: 'eloboard.com' },
      { protocol: 'https', hostname: 'ssustar.iwinv.net' },
      { protocol: 'https', hostname: 'www.cnine.kr' },
      { protocol: 'https', hostname: 'liveimg.sooplive.com' },
      { protocol: 'https', hostname: 'liveimg.sooplive.co.kr' },
      { protocol: 'https', hostname: 'stimg.sooplive.com' },
      { protocol: 'https', hostname: 'profile.img.sooplive.com' },
      { protocol: 'https', hostname: 'profile.img.sooplive.co.kr' },
    ],
  },
};

export default nextConfig;
