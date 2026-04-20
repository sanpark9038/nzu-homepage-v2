import Link from "next/link";

import { getActiveHeroMedia, sanitizeHeroMediaType } from "@/lib/hero-media";

export const revalidate = 60;

export const metadata = {
  title: "HOSAGA",
  description: "대회 홈 화면과 주요 진입 경로를 가장 빠르게 연결하는 메인 페이지",
};

export default async function HomePage() {
  const activeHeroMedia = await getActiveHeroMedia();
  const heroMediaType = activeHeroMedia ? sanitizeHeroMediaType(activeHeroMedia.type) : "image";
  const heroMediaUrl = activeHeroMedia?.url || "/home-hero-reference.png";
  const heroVideoMimeType = heroMediaUrl.toLowerCase().includes(".webm") ? "video/webm" : "video/mp4";

  return (
    <div className="min-h-full bg-background text-foreground">
      <main>
        <section className="group relative isolate h-[calc(100svh-4rem)] min-h-[560px] w-full overflow-hidden">
          {heroMediaType === "video" ? (
            <video
              key={heroMediaUrl}
              className="absolute inset-0 h-full w-full scale-[1.02] object-cover object-center transition-transform duration-700 group-hover:scale-[1.045]"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            >
              <source src={heroMediaUrl} type={heroVideoMimeType} />
            </video>
          ) : (
            <img
              src={heroMediaUrl}
              alt="홈 메인 히어로"
              className="absolute inset-0 h-full w-full scale-[1.02] object-cover object-center transition-transform duration-700 group-hover:scale-[1.045]"
            />
          )}

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,6,8,0.08),rgba(3,6,8,0.16)_34%,rgba(3,6,8,0.34)_68%,rgba(3,6,8,0.72))] transition-opacity duration-500 group-hover:opacity-90" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_24%),radial-gradient(circle_at_left_center,rgba(41,209,122,0.1),transparent_20%)] opacity-80 transition-opacity duration-500 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background/85 via-background/32 to-transparent" />

          <div className="relative mx-auto flex h-full w-full max-w-6xl items-end px-4 pb-10 pt-8 md:px-8 md:pb-14 lg:px-6 lg:pb-16 xl:px-0">
            <div className="max-w-5xl">
              <h1 className="relative -left-[2rem] top-3 text-[2.55rem] font-black leading-[0.92] tracking-[-0.07em] text-white drop-shadow-[0_18px_44px_rgba(0,0,0,0.34)] md:-left-[9.5rem] md:top-5 md:text-[4.9rem] lg:-left-[20rem] lg:top-7 lg:text-[6.4rem]">
                <span className="block overflow-hidden">
                  <span
                    className="block [animation:heroTitleLift_720ms_cubic-bezier(0.22,1,0.36,1)_1000ms_both]"
                    style={{ willChange: "transform, opacity" }}
                  >
                    오늘은
                  </span>
                </span>
                <span className="block overflow-hidden">
                  <span
                    className="block [animation:heroTitleLift_720ms_cubic-bezier(0.22,1,0.36,1)_1320ms_both]"
                    style={{ willChange: "transform, opacity" }}
                  >
                    당신입니다
                  </span>
                </span>
              </h1>

              <div className="relative -left-[2rem] top-3 mt-8 flex translate-y-2 flex-col gap-3 opacity-[0.03] transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:flex-row md:-left-[9.5rem] md:top-5 lg:-left-[20rem] lg:top-7">
                <Link
                  href="/entry"
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-nzu-green px-6 text-sm font-black tracking-tight text-black transition-transform duration-200 hover:-translate-y-0.5"
                >
                  엔트리 바로 시작
                </Link>
                <Link
                  href="/teams"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/16 bg-black/24 px-6 text-sm font-black tracking-tight text-white backdrop-blur-md transition-colors duration-200 hover:border-white/28 hover:bg-black/36"
                >
                  참가팀 확인
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <style>{`
        @keyframes heroTitleLift {
          0% {
            opacity: 0;
            transform: translate3d(0, 22px, 0);
          }

          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>
    </div>
  );
}
