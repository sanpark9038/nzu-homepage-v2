import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack이 루트를 바탕화면으로 오인해 Desktop 전체(GPUCache 등 상시 변동 폴더)를
  // 감시 → 재컴파일 폭주로 머신이 멈춘 사건(2026-07-30) 재발 방지 — 루트를 명시 고정한다.
  // __dirname은 TS 설정 번들링 환경에 따라 빈 값이 될 수 있어 cwd로 고정한다
  turbopack: {
    root: process.cwd(),
  },
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
