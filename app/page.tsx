import Link from "next/link";
import Image from "next/image";

import HomeHeroDeck from "@/components/home/HomeHeroDeck";
import { getActiveHeroMedia, getHeroMode, getHeroTitle, sanitizeHeroMediaType } from "@/lib/hero-media";
import {
  buildJungmanGroupTables,
  buildJungmanPlayerRanks,
  JUNGMAN_STANDINGS_KEY,
  parseJungmanStandings,
  sortJungmanMatches,
  type JungmanStandings,
} from "@/lib/jungman-standings";
import { getSetting } from "@/lib/site-settings";

export const revalidate = 60;

export const metadata = {
  // 홈만 template을 끈다 — "HOSAGA | 호사가 HOSAGA"처럼 브랜드가 두 번 붙는 걸 막는다
  title: { absolute: "스타호사가 (HOSAGA) — 스타크래프트 대학대전" },
  description:
    "스타호사가는 숲 스타크래프트 대학대전을 기록하는 팬 사이트입니다. 티어표와 선수 전적, 경기 일정과 승부예측을 한곳에서 볼 수 있습니다.",
  // canonical·og:url은 페이지마다 자기 주소로 붙인다 — 루트 레이아웃에 두면 하위 페이지까지 "/"로 상속된다
  alternates: { canonical: "/" },
  openGraph: {
    title: "스타호사가 (HOSAGA) — 스타크래프트 대학대전",
    description: "숲 스타크래프트 대학대전 기록 사이트. 티어표, 선수 전적, 경기 일정, 승부예측",
    url: "/",
    siteName: "호사가 HOSAGA",
    type: "website",
    locale: "ko_KR",
  },
};

/**
 * 커버 덱의 조별 순위 슬라이드 재료. getSetting은 실패하면 던진다 —
 * 순위 한 칸을 못 읽었다고 홈 전체가 죽으면 안 되므로 여기서 삼키고 커버 한 장으로 떨어뜨린다.
 */
async function loadJungmanStandings(): Promise<JungmanStandings | null> {
  try {
    return parseJungmanStandings(await getSetting(JUNGMAN_STANDINGS_KEY));
  } catch (error) {
    console.error("failed to load jungman standings for hero deck", error);
    return null;
  }
}

export default async function HomePage() {
  // 모드 키가 없으면(null) 인자 없이 부른다 — 지금까지의 홈과 완전히 같은 질의·같은 화면.
  const heroMode = await getHeroMode();
  const activeHeroMedia = heroMode === "deck" ? null : await getActiveHeroMedia(heroMode ?? undefined);
  // 순위 질의는 덱 모드에서만 — 이미지·영상 모드의 홈은 예전 그대로 질의해야 한다
  const jungmanStandings = heroMode === "deck" ? await loadJungmanStandings() : null;
  const groupTables = jungmanStandings ? buildJungmanGroupTables(jungmanStandings) : [];
  const heroTitleLines = (await getHeroTitle())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const heroMediaType = activeHeroMedia ? sanitizeHeroMediaType(activeHeroMedia.type) : "image";
  // 저장된 히어로가 없으면 미디어 없이 배경 그라디언트만 그린다 (샘플 폴백 이미지는 제거됨).
  const heroMediaUrl = activeHeroMedia?.url || null;
  const heroVideoMimeType = (heroMediaUrl || "").toLowerCase().includes(".webm") ? "video/webm" : "video/mp4";

  return (
    <div className="min-h-full bg-background text-foreground">
      <main>
        <section className="relative isolate h-[100svh] min-h-[min(560px,100svh)] w-full overflow-hidden">
          {heroMode === "deck" ? (
            <HomeHeroDeck
              titleLines={heroTitleLines}
              groups={jungmanStandings?.groups ?? []}
              // 덱이 자기 표를 직접 그린다 — /jungman 표는 스크롤 페이지용이라 고정 높이에 안 들어간다.
              // tables가 비면 덱이 커버 한 장이 된다.
              tables={groupTables}
              matches={sortJungmanMatches(jungmanStandings?.matches ?? [])}
              playerRanks={buildJungmanPlayerRanks(jungmanStandings?.matches ?? [])}
            />
          ) : (
            <>
              {heroMediaUrl && heroMediaType === "video" ? (
                <video
                  key={heroMediaUrl}
                  className="absolute inset-0 h-full w-full scale-[1.02] object-cover object-center"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                >
                  <source src={heroMediaUrl} type={heroVideoMimeType} />
                </video>
              ) : heroMediaUrl ? (
                <Image
                  src={heroMediaUrl}
                  alt="홈 메인 히어로"
                  fill
                  priority
                  sizes="100vw"
                  className="scale-[1.02] object-cover object-center"
                />
              ) : (
                <div className="absolute inset-0 bg-[#060a08]" />
              )}

              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,6,8,0.08),rgba(3,6,8,0.16)_34%,rgba(3,6,8,0.34)_68%,rgba(3,6,8,0.72))]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_24%),radial-gradient(circle_at_left_center,rgba(41,209,122,0.1),transparent_20%)] opacity-80" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background/85 via-background/32 to-transparent" />

              <div className="relative mx-auto flex h-full w-full max-w-6xl items-end px-4 pb-10 pt-8 md:px-8 md:pb-14 lg:px-6 lg:pb-16 xl:px-0">
                <div className="max-w-5xl">
                  <h1 className="relative top-3 text-[2.55rem] font-black leading-[0.92] tracking-[-0.07em] text-white drop-shadow-[0_18px_44px_rgba(0,0,0,0.34)] md:-left-[9.5rem] md:top-5 md:text-[4.9rem] lg:-left-[20rem] lg:top-7 lg:text-[6.4rem]">
                    {heroTitleLines.map((line, index) => (
                      <span key={`${index}-${line}`} className="block overflow-hidden">
                        <span
                          className="block [animation:heroTitleLift_720ms_cubic-bezier(0.22,1,0.36,1)_both]"
                          style={{ willChange: "transform, opacity", animationDelay: `${1000 + index * 320}ms` }}
                        >
                          {line}
                        </span>
                      </span>
                    ))}
                  </h1>

                  <div className="relative top-3 mt-8 flex flex-col gap-3 sm:flex-row md:-left-[9.5rem] md:top-5 lg:-left-[20rem] lg:top-7">
                    <Link
                      href="/prediction"
                      className="inline-flex min-h-12 items-center justify-center rounded-full bg-nzu-green px-6 text-sm font-black tracking-tight text-black transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      승부예측
                    </Link>
                    <Link
                      href="/schedule"
                      className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/16 bg-black/24 px-6 text-sm font-black tracking-tight text-white backdrop-blur-md transition-colors duration-200 hover:border-white/28 hover:bg-black/36"
                    >
                      일정
                    </Link>
                  </div>
                </div>
              </div>
            </>
          )}
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
