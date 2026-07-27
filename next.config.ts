import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ISR stale 허용창(기본 300초). 이보다 오래 한산했던 페이지는 다음 방문자가 재생성을
  // 통째로 기다린다(콜드 스타트 ~2초) — 하루로 늘려 stale을 즉시 주고 뒤에서 갱신하게 한다.
  expireTime: 86_400,
  experimental: {
    proxyClientMaxBodySize: 64 * 1024 * 1024,
  },
  async headers() {
    return [
      {
        source: "/multiview",
        headers: [
          {
            key: "Permissions-Policy",
            value: "local-network-access=*",
          },
        ],
      },
    ];
  },
  images: {
    deviceSizes: [640, 768, 1024, 1280],
    imageSizes: [32, 48, 64, 96, 128, 160, 256, 384],
    minimumCacheTTL: 2678400,
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
      { protocol: 'https', hostname: 'ttglvnnzssaaypmcrmdt.supabase.co' },
      { protocol: 'https', hostname: 'images.star-hosaga.com' },
    ],
  },
};

export default nextConfig;
