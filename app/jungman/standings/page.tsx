import type { Metadata } from "next";

import Image from "next/image";

import JungmanSubNav from "@/components/jungman/JungmanSubNav";
import { JUNGMAN_TEAMS, jungmanLogoPath } from "@/lib/jungman";
import {
  buildJungmanGroupTables,
  JUNGMAN_STANDINGS_KEY,
  parseJungmanStandings,
  type JungmanGroupTable,
} from "@/lib/jungman-standings";
import { getSetting } from "@/lib/site-settings";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "K-중만컵 조별 순위",
  description:
    "K-중만컵 조별리그 순위표. 4개조 12팀의 승패 · 세트 득실 · 잔여 경기를 조별로 확인할 수 있습니다.",
  alternates: { canonical: "/jungman/standings" },
  openGraph: {
    title: "K-중만컵 조별 순위 | 호사가 HOSAGA",
    description: "K-중만컵 조별리그 순위 — 승패, 세트 득실, 잔여 경기",
    url: "/jungman/standings",
    siteName: "호사가 HOSAGA",
    type: "website",
    locale: "ko_KR",
  },
};

const PANEL =
  "rounded-[1.4rem] border border-[rgba(155,185,240,0.14)] bg-[linear-gradient(180deg,#101728,#0c1220)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

// 조 2위까지 8강 진출 — 진출선을 어디에 그을지의 기준
const ADVANCING = 2;

// 조마다 다른 색. 지도·조 편성 화면과 같은 순서를 쓴다.
const GROUP_COLORS = ["#2BE39B", "#4A9EFF", "#C9A84C", "#E0574A"];

// 저장된 팀 이름은 자유 문자열이라 별칭으로도 로고를 찾는다
const CODE_BY_NAME = new Map<string, string>(
  JUNGMAN_TEAMS.flatMap((team) => [
    [team.name, team.code] as [string, string],
    ...team.aliases.map((alias) => [alias, team.code] as [string, string]),
  ])
);

const TH = "text-right text-[0.625rem] font-bold tracking-[0.06em] text-[#7a8299] md:text-[0.6875rem]";
const NUM = "text-right font-black tabular-nums text-[#e8ebf2] text-sm md:text-lg";

function GroupCard({ table, color }: { table: JungmanGroupTable; color: string }) {
  return (
    <section className={`${PANEL} overflow-hidden`} style={{ ["--gc" as string]: color }}>
      <header
        className="flex items-baseline gap-2 px-4 py-2.5 md:px-5 md:py-3"
        style={{ background: `linear-gradient(90deg, ${color}42, transparent 62%)` }}
      >
        <h2 className="text-base font-black tracking-tight md:text-xl" style={{ color }}>
          {table.name}
        </h2>
        <span className="text-[0.625rem] font-bold text-[#7a8299] md:text-xs">
          {table.rows.length}팀 풀리그
        </span>
      </header>

      <div className="px-3 pb-3 md:px-4 md:pb-4">
        {/* 열 이름 — 아래 각 줄과 같은 격자를 쓴다 */}
        <div className="grid grid-cols-[1fr_2.2rem_2.2rem_3rem_3.4rem_2.8rem] items-center gap-1.5 py-2 md:gap-2">
          <span className={`${TH} text-left`}>팀</span>
          <span className={TH}>승</span>
          <span className={TH}>패</span>
          <span className={TH}>세트승</span>
          <span className={TH}>세트득실</span>
          <span className={TH}>잔여</span>
        </div>

        {table.rows.map((row, index) => {
          const advancing = index < ADVANCING;
          const code = CODE_BY_NAME.get(row.team);
          return (
            <div
              key={row.team}
              className={`relative grid grid-cols-[1fr_2.2rem_2.2rem_3rem_3.4rem_2.8rem] items-center gap-1.5 border-t border-[rgba(155,185,240,0.07)] py-2.5 md:gap-2 md:py-3 ${
                index === ADVANCING - 1 ? "border-b-2 border-b-dashed border-b-[rgba(43,227,155,0.45)]" : ""
              } ${index === ADVANCING ? "border-t-0" : ""}`}
            >
              {/* 진출권 표시 — 왼쪽 세로 막대 */}
              {advancing ? (
                <span
                  aria-hidden
                  className="absolute bottom-[18%] left-0 top-[18%] w-[3px] rounded-full"
                  style={{ background: color }}
                />
              ) : null}

              <span className="flex min-w-0 items-center gap-2 pl-2.5 md:gap-2.5">
                <span
                  className="w-4 shrink-0 text-center text-xs font-black tabular-nums md:text-sm"
                  style={{ color: advancing ? color : "rgba(232,235,242,0.34)" }}
                >
                  {index + 1}
                </span>
                {code ? (
                  <Image
                    src={jungmanLogoPath(code)}
                    alt=""
                    width={32}
                    height={32}
                    className="h-6 w-6 shrink-0 object-contain md:h-8 md:w-8"
                  />
                ) : null}
                <span className="truncate text-sm font-black text-[#e8ebf2] md:text-lg">{row.team}</span>
              </span>

              <span className={NUM}>{row.wins}</span>
              <span className={`${NUM} text-[rgba(232,235,242,0.55)]`}>{row.losses}</span>
              <span className={NUM}>{row.setsWon}</span>
              <span
                className={`${NUM} ${
                  row.setDiff > 0 ? "text-[#2BE39B]" : row.setDiff < 0 ? "text-[#e0574a]" : ""
                }`}
              >
                {row.setDiff > 0 ? `+${row.setDiff}` : row.setDiff}
              </span>
              <span className="text-right text-[0.6875rem] font-bold tabular-nums text-[#7a8299] md:text-sm">
                {row.remaining}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function JungmanStandingsPage() {
  // 읽기 실패는 getSetting이 던진다 — 빈 순위표를 정상 상태로 캐시하는 것보다 낫다
  const standings = parseJungmanStandings(await getSetting(JUNGMAN_STANDINGS_KEY));
  const tables = standings ? buildJungmanGroupTables(standings) : [];

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-[#e8ebf2]">
      <main className="mx-auto w-full max-w-[1600px] px-3 py-3 md:px-5 md:py-5">
        <JungmanSubNav activeHref="/jungman/standings" />

        <section className={`${PANEL} mb-3 px-4 py-3 md:mb-4 md:px-5 md:py-4`}>
          <p className="hidden text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-[#d4a94a] md:block">
            K-중만컵 · 조별리그
          </p>
          <h1 className="text-xl font-black tracking-tight md:mt-2 md:text-3xl">조별 순위</h1>
          <p className="mt-1.5 hidden text-sm text-[#7a8299] md:block">
            매치 승패 → 세트 득실 → 세트 승 → 동률팀 간 승자승 순으로 정렬합니다.
            <b className="font-bold text-[#e8ebf2]"> 점선 위가 8강 진출권</b>이고, 잔여는 남은 경기 수입니다.
          </p>
        </section>

        {tables.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {tables.map((table, i) => (
              <GroupCard key={table.name} table={table} color={GROUP_COLORS[i % GROUP_COLORS.length]} />
            ))}
          </div>
        ) : (
          <section className={`${PANEL} px-4 py-5 md:p-6`}>
            <h2 className="text-base font-black tracking-tight md:text-xl">조 편성 발표 전입니다</h2>
            <p className="mt-2 text-xs leading-relaxed text-[#7a8299] md:text-sm">
              총 <b className="font-bold text-[#e8ebf2]">12팀</b>이 3팀씩 4개조(A~D)로 나뉘어 조별리그를 치릅니다.
              편성이 발표되면 이 화면에 조별 순위표가 올라옵니다.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
